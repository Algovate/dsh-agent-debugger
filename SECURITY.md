# Security

Agent Debugger pauses a live agent and shows what it is about to send or do. It does not run
tools or commands itself; the normal DSH tool pipeline, approval, and sandbox still apply.

## What the plugin can see

- The assembled system-prompt section/context names, sizes, and bounded previews.
- Recent model-visible messages, tool names, and the request header (provider/model/tools).
- Frozen tool arguments for a matched call.
- The last assistant message, including a finish pause's final answer.
- Tool call/result pairs for the inspector.

This data is kept **in memory only**. It is not written to disk and is not sent to the network by
the plugin. The browser API is guarded by `connection.requestRejection`.

## What the plugin does not do

- It does not execute shell commands or tool bodies.
- It does not rewrite frozen tool arguments; “edit” is a deny-plus-guided-reissue flow.
- It does not bypass the sandbox, approval, or monotonic guards.
- It does not edit system-prompt sections or historical messages.
- It does not persist breakpoints across Host restarts.

## User responsibilities

- A breakpoint blocks the agent until you resolve it or `autoAllowAfterMs` expires. Keep the
  timeout short if the tab may be closed.
- The inspector can show prompts, tool output, and arguments containing secrets or personal data.
  Do not copy a request snapshot into a public issue.
- Subagents have their own sessions; arm them separately if you want to debug them.

## Reporting

Report vulnerabilities through the GitHub private security advisory:
<https://github.com/Algovate/dsh-agent-debugger/security/advisories/new>.

Do not include tokens, credentials, full session logs, or customer data in a public issue.
