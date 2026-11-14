# Agent Debugger

[![CI](https://github.com/Algovate/dsh-agent-debugger/actions/workflows/ci.yml/badge.svg)](https://github.com/Algovate/dsh-agent-debugger/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/dsh-agent-debugger.svg)](https://www.npmjs.com/package/dsh-agent-debugger)

![Agent Debugger demo: tool pause, diff preview, finish pause](docs/demo.gif)

<sub>Simulated UI demo; the plugin is installed and unit-tested. The GIF is generated from the deterministic timeline in <a href="docs/demo.html">docs/demo.html</a>.</sub>

> **Stop the agent before it acts or delivers.** Set a breakpoint on the next model step, the next matching tool call, or the turn closing; inspect the assembled prompt, pending action, or final answer, then allow, skip, edit, steer, or finish.

Trajectory viewers show what happened. Approvals decide whether something may run. Neither lets you pause a live agent, look at exactly what it is about to send, do, or deliver, and change course.

Agent Debugger adds that layer:

- **Step breakpoint** — pause before every model call, inspect the final system-prompt sections, recent model-visible messages, model, and tool face. Continue, append one instruction, or stop the turn. Step mode stays armed after Continue; Stop/Off leaves it. A timeout disarms it so an unattended turn cannot wait 120s per step.
- **Tool breakpoint** — pause before a matching tool call, inspect its frozen arguments. Allow, skip, edit-and-retry, or stop the turn.
- **Finish breakpoint** — pause before the turn closes, inspect the final assistant message. Finish the turn, or add one instruction and continue for another step. A timeout finishes safely.
- A breakpoint really blocks the agent until you act or the timeout fires.

## Demo

1. Click **Next tool** above the composer (or `/debug tool`).
2. The agent stops before `bash`; the panel shows the command and the latest prompt sections.
3. Change `rm -rf build` to `rm -rf dist`, click **Edit & retry**.
4. The model receives a denial that names the edited arguments and is told to re-issue the call. The next call uses `dist`.

## The boundary that matters

DSH freezes and logs tool arguments before `tools/pre-execute`; a plugin cannot silently rewrite them. Editing is therefore a **guided retry**: deny the original call with the original and edited arguments plus an explicit re-issue instruction. It costs one extra model step and keeps the audit trail honest. The panel says so.

## Surfaces

| Surface | Actions |
|---|---|
| Dock | Step mode, next match, off, open panel; while paused: step/tool/finish + auto-release/finish countdown. Finish is armed from the panel or `/debug finish`. |
| Pause panel | Tool: allow / edit & retry / skip / stop; Step: next step / run to end / add & continue / stop; Finish: finish / add guidance & continue; Request/Origins/Output tabs with search, role filters, expand-all, and copy-request |
| `/debug` | `status`, `step`, `tool`, `finish`, `always`, `off` |

### Why the sidebar

A floating card competes with the composer and the viewport; on short windows its buttons get clipped. The debugger uses a persistent sidebar tab instead: it auto-opens on a pause, keeps the conversation visible, and does not fight the viewport height. If the sidebar is unavailable or closed, the dock still offers a minimal allow/continue/finish fallback, so the agent never hangs.

The panel is ordered conclusion-first: pending action and buttons on top, then **Request / Origins / Output**. Request is a preview for step pauses and a sent request for tool/finish pauses; Output is the most recent available result.

## Config

| Key | Default | Meaning |
|---|---|---|
| `tools` | `bash,write,edit` | Comma-separated names or prefixes (`write*`); `*` matches all |
| `autoAllowAfterMs` | `120000` | Auto-release or finish so a closed tab cannot hang the agent |
| `maxHistory` | `20` | Breakpoint events kept per session |
| `maxPromptChars` | `200000` | Full request text budget, memory only |

## Safety

- Opt-in: nothing pauses until you arm a breakpoint.
- One breakpoint per session; concurrent matching calls are allowed immediately.
- The pause blocks the agent; tool/step pauses auto-release, and a finish pause safely finishes the turn after the timeout.
- The full request, sections, messages, and arguments stay in memory; no disk, no network.
- Subagents have their own sessions and are not paused by the parent.
- Tool edits are explicit denials, never silent rewrites; step/finish instructions are appended as `agent-debugger` user messages.
- Previews are read-only: `edit`/`write` diff and content come from frozen arguments, never a filesystem read; long text is truncated.

## Install

```sh
dsh plugin --profile desktop add dsh-agent-debugger
```

## Test

```sh
cd dsh-agent-debugger && npm test
```

Coverage: matching, tool allow/edit/skip/stop, step and finish pauses, timeout/abort/disarm, inspector bounds, edit/write previews, locale and client registration.

See [docs/DETAIL.md](docs/DETAIL.md) for seam semantics and failure modes.
Current verification: [docs/verification.md](docs/verification.md);
chronological UI history: [docs/verification-history.md](docs/verification-history.md).
Security: [SECURITY.md](SECURITY.md); release checklist: [docs/RELEASE.md](docs/RELEASE.md).

## Mechanism map

| DSH mechanism | Where | What it does |
|---|---|---|
| `agent/pre-step` waterfall | `index.js` | Pause before a model step; append one instruction or reject |
| `tools/pre-execute` waterfall | `index.js` | Pause before dispatch; allow / deny / cancel |
| `agent/turn-stopping` serial | `index.js` | Pause before the turn closes; finish or steer one more step |
| `agent.steer` | `index.js` | Send finish-pause guidance back into the same turn |
| `system-prompt/assemble` | `index.js` | Snapshot section names and bounded previews |
| `request/header` | `index.js` | Record model and tool face |
| Cordis `Service` | `ctx.agentDebugger` | Per-session breakpoint state |
| Slash command | `/debug` | Human control |
| HTTP + Connection admission | `/agent-debugger/api/*` | State/arm/disarm/resolve for the dock and panel |
| Slot + theme + i18n | `conversation.input.dock` | Compact status row + pause panel |
| Read-only argument preview | `client.js` | `edit` diff, `write` body, `bash` command |

## Limitations

- Tool arguments cannot be edited in place (DSH freezes them); editing is deny-and-re-issue.
- The final assistant message cannot be edited; finish can only close the turn or add one instruction.
- The HTML preview is a line-level diff of frozen arguments, not a real on-disk diff; it does not read the current file.
- A closed tab waits for the timeout; lower `autoAllowAfterMs` if that is risky.
- Subagents have their own sessions and are not paused by the parent.

## Roadmap

1. **Failure breakpoint** — `tools/post-execute`, pause before the model reads a failed tool result.
2. **Conditional breakpoint** — a minimal substring matcher, config first, no regex DSL.

Not planned: breakpoint history replay/fork, editing system-prompt sections, batch/step-over/step-into. They need persistence, branching, or rewriting frozen requests, far from live interception.
