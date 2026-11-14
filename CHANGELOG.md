# Changelog

## 0.2.0

### Features

- Turn-end breakpoint: pause with `agent/turn-stopping` before the turn closes, review the final assistant message, then finish or add one instruction and continue. `agent.steer` keeps the turn open; the default timeout safely finishes.
- Edit/write preview: `edit` renders a bounded old/new line diff, `write` shows the path, line count, and a capped body, and `apply_patch` shows the patch text. Rendering only; no filesystem read or call rewrite.

### Fixes and hardening

- Review hardening: timeout disarms step/tool modes; turn-end state; claimed-message labeling; finish extraction; panel error boundary; sidebar retry cap; session-state eviction.
- Renamed dock actions to **Step mode / 逐步模式** and **Next match / 下个匹配工具**; pending meta shows step/tool/finish and the auto-release countdown.
- Step pause primary is **Next step / 下一步**, with **Run to end / 跑完本回合** to disarm without stopping.
- Arming while a breakpoint is pending no longer releases it; the mode change is refused and reported.
- Inspector: Request/Origins/Output tabs, search, message-role filters, expand-all, copy-request, and step number.
- Removed dead repository/homepage/bugs URLs (GitHub repo does not exist yet).

### Internal

- Refactor without behavior changes: shared mode/instruction/pause helpers in the engine, session/instruction/diagnostic helpers in the host, and extracted pause, editor, dock, and inspector-row components in the client. Tests now cover the rendered pause and inspector trees.
- Split verification into a current-state document and a chronological UI history.

## 0.1.0

- Tool breakpoints: pause before matching tool calls; allow, skip, edit-and-retry, or stop.
- Step breakpoints: pause before model steps; continue, append one instruction, or stop.
- Prompt inspector: bounded section/context previews, model, tool face, recent messages.
- Composer dock, pause modal, `/debug` command, authenticated HTTP API.
- Safe auto-release timeout, abort/dispose/disarm handling, one breakpoint per session.
- All state in memory; no disk or network.
