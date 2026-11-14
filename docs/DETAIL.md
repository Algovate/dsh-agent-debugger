# Agent Debugger — Details

![Agent Debugger demo: tool pause, diff preview, finish pause](demo.gif)

*Simulated UI demo. The plugin is installed and verified; the source of the animation is [demo.html](demo.html).*

## Seams

| Seam | Event | Use |
|---|---|---|
| Model step | `agent/pre-step` waterfall | Pause before the next model call; return `{kind:'enter', messages}` or `{kind:'reject'}` |
| Tool call | `tools/pre-execute` waterfall | Pause before dispatch; return `allow` / `deny` / `cancel` |
| Turn close | `agent/turn-stopping` serial | Pause before the turn closes; return normally, or `agent.steer` one instruction to continue |
| Continue step | `agent.steer` | Send the finish-pause instruction back into the same turn |
| Prompt | `system-prompt/assemble` waterfall | Keep section/context names, sizes, bounded previews |
| Tool face | `request/header` events | Provider, model, tool names |
| Session | `session/disposed` | Release pending breakpoints |

## Surfaces

- **Dock** — the status row above the composer. It arms step/tool modes, shows the pending kind and countdown, and opens the panel. It keeps a minimal allow/continue/finish fallback so a closed or unavailable sidebar cannot trap the agent. The finish breakpoint is armed from the sidebar or `/debug finish`; the dock deliberately has no fourth primary button.
- **Debugger sidebar tab** — registered through `ctx.betterSidebar.registerTab` with `single: true`; the dock opens it automatically on a pause. It owns the full pause UI: message/tool/final-answer review, editors, and the request inspector.
- **`/debug`** — `status`, `step`, `tool`, `finish`, `always`, `off`.

State is served by the Host HTTP API. The dock and the panel poll independently; both act on the same `pending`, first resolve wins, and the other sees the change on its next poll.

## How a pause works

The step and tool hooks are async waterfalls; turn-stopping is a serial checkpoint; all three can await. A breakpoint parks a Promise inside one until the user resolves it over the authenticated HTTP API, `autoAllowAfterMs` expires, the turn aborts, the user disarms, the session is disposed, or the plugin unloads. Timeouts and aborts use the safe default: allow the tool, continue the step, or finish the turn.

## Action mapping

Tool breakpoint:

- Allow → `next()` (later policy and approval still run).
- Skip → `{kind:'deny', reason}` with a do-not-retry instruction.
- Edit & retry → `{kind:'deny', reason}` containing the original arguments, edited arguments, and an explicit re-issue instruction.
- Stop turn → `agent.cancel({kind:'user'})` and `{kind:'cancel'}`.

Step breakpoint:

- Continue → the original decision.
- Add & continue → the decision with one appended `agent-debugger` user message.
- Stop turn → `agent.cancel({kind:'user'})` and `{kind:'reject'}`.

Finish breakpoint:

- Finish → return from the turn-stopping listener; the turn closes normally.
- Add & continue → `agent.steer(message)` before returning; the machine re-reads its inbox and runs another step.

The finish pause runs after the final `assistant/message` is recorded and before `turn/end`. It cannot rewrite the final answer, only close the turn or steer one more step. There is no Stop action because the turn is already ending.

## Argument preview

A tool pause renders frozen arguments by tool:

- `edit`: `file_path` plus a line-level `old_string`/`new_string` diff and `replace_all`.
- `write`: `file_path`, line count, and a body preview capped at 6000 characters.
- `apply_patch`: the patch text, capped at 8000 characters.
- Other tools: the `command` argument when present, otherwise pretty JSON.

The preview is read-only, never reads the filesystem, and never rewrites the call; long content is truncated and labeled.

## Why editing is a guided retry

DSH freezes tool arguments before `tools/pre-execute` and logs the original call. `PreToolDecision` explicitly excludes input rewriting. Silently changing arguments would break both the audit trail and the model's view of what it asked for. The debugger therefore denies the original call and tells the model exactly which arguments to use on a re-issue. It costs one extra model step and stays traceable.

## Request inspector

The pause panel's **Request / Origins / Output** tabs load `/agent-debugger/api/inspect` on demand, so a large prompt never enters the polled state:

- **Request** — `request/header` config and full tool schemas; `system-prompt/assemble` sections/contexts; the last 24 model-visible messages (up to 4000 chars each) reconstructed at pause time. Step pauses show the next request; tool and finish pauses show the last sent request.
- **Origins** — section names and message `source.kind`; `request/header` does not record tool ownership, so the panel says “tool owner unavailable” instead of guessing.
- **Output** — the last assistant text/tool calls/usage/finish and the `tool/call` + `tool/result` pair (success/failure/output).

“Full” means within the storage caps: `maxPromptChars` defaults to 200000 and anything beyond it is truncated and labeled. Messages are reconstructed from the session surface, not a byte-for-byte provider serialization.

## Prompt inspector

`system-prompt/assemble` provides `sections`, `contexts`, and variable names. The debugger keeps names, character counts, previews (1200 chars per section, 600 per context), full section/context text within the shared `maxPromptChars` budget, and the last 24 model-visible messages (4000 chars each). Everything stays in memory; nothing is persisted or sent out.

## Concurrency and ordering

One breakpoint per session; a second matching call is allowed immediately. Tool breakpoints compose with approval (the approval still asks after the debugger allows). Step breakpoints run after the default pre-step decision, so the inspector sees the final messages. Persistent step mode uses `once:false` and keeps pausing every model step until Stop/Off; a timeout disarms it. `always` keeps pausing matching tools until `/debug off`. The finish breakpoint is one-shot by default; with `once:false` it pauses at every turn close until `/debug off`. All modes share the same pending slot.

## Failure modes

- Closed page: the breakpoint waits until the timeout, then allows (or finishes the turn).
- The model ignores the edited-arguments instruction: the original call is still denied; it must re-issue or choose another approach.
- No prompt snapshot: the panel shows arguments/messages only.
- No final assistant message: the finish panel shows “no result” but still lets you finish or steer.
- `agent.steer` is unavailable or throws: the plugin records a diagnostic and lets the turn close instead of fabricating a message.
- Preview text is truncated for very large edits/writes; it is not a full on-disk diff.
- Subagents have their own sessions and are not paused by the parent's breakpoint.
- The default tool matcher is `bash,write,edit`; configure `tools` for others.

## Config bounds

- `autoAllowAfterMs` is clamped to 5000–600000; 5000 avoids a timeout so short the pause is meaningless.
- `maxPromptChars` is clamped to 1000–200000; parts beyond the budget keep their character count but no preview.
- `maxHistory` is clamped to 1–100.
