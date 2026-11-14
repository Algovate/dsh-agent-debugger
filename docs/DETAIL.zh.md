# 智能体调试器 · 细节

## 它接在哪

| 接缝 | 事件/方法 | 用途 |
|---|---|---|
| 模型步 | `agent/pre-step` waterfall | 在每次模型调用前暂停；返回 `{kind:'enter', messages}` 或 `{kind:'reject'}` |
| 工具调用 | `tools/pre-execute` waterfall | 在工具执行前暂停；返回 `allow` / `deny` / `cancel` |
| 回合结束 | `agent/turn-stopping` serial | 在回合关闭前暂停；返回后正常结束，或 `agent.steer` 一句继续 |
| 继续一步 | `agent.steer` | 把交付前加的指导送回同一条回合 |
| 提示词 | `system-prompt/assemble` waterfall | 取最终装配的 `sections` / `contexts`（只留名字、字符数、预览） |
| 工具面 | `request/header` 会话事件 | 记录 provider/model 与工具名 |
| 会话 | `session/disposed` | 释放该会话的断点并清状态 |

## 渲染面与命令

- **Dock**：输入框上方的状态行。负责 arm、状态、打开面板；暂停时提供最小的放行/继续/结束，保证侧栏不可用时 Agent 不会卡死。交付前断点从侧栏或 `/debug finish` 开启，Dock 不加第四个主按钮。
- **右侧栏「调试器」标签页**：通过 `ctx.betterSidebar.registerTab` 注册，`single: true`；暂停时由 Dock 调用 `openTab` 自动打开。完整面板（消息、参数编辑、最终回答、提示词快照）都在这里。
- **`/debug`**：`status`、`step`、`tool`、`finish`、`always`、`off`。

暂停状态由 Host 的 HTTP API 提供，Dock 与侧栏面板各自轮询；两边操作同一个 `pending`，先到先得，另一边在下一次轮询时看到状态变化。

## 暂停是怎么实现的

`tools/pre-execute` 和 `agent/pre-step` 是 waterfall，`agent/turn-stopping` 是 serial；三者都可以 `await`。断点就是把一个 Promise 挂在里面，直到：

- 用户在面板里点了动作（HTTP `resolve`）；
- 或 `autoAllowAfterMs` 到期；
- 或该回合被 abort；
- 或用户 disarm / 会话销毁 / 插件卸载。

超时和 abort 都会走**安全默认**：工具放行、步骤继续、回合正常结束。这样关掉页面不会把 Agent 永久挂死。

## 动作到决策的映射

### 工具断点

| 面板动作 | 返回值 | 模型看到什么 |
|---|---|---|
| 放行 | `next()`（继续后面的 pre-execute / approval） | 正常执行 |
| 跳过 | `{kind:'deny', reason}` | “用户跳过了这次调用，不要重试，换一种方式或说明阻塞” |
| 改参数重发 | `{kind:'deny', reason}` | 原参数、新参数、以及“用新参数重新调用”的明确指示 |
| 停止回合 | `agent.cancel({kind:'user'})` + `{kind:'cancel'}` | 回合停止 |

### 步骤断点

| 面板动作 | 返回值 | 效果 |
|---|---|---|
| 继续 | 原 `decision` | 不变 |
| 加一句并继续 | `{...decision, messages:[...decision.messages, message]}` | 追加一条 `source.kind = 'agent-debugger'` 的 user 消息 |
| 停止回合 | `agent.cancel({kind:'user'})` + `{kind:'reject'}` | 回合停止 |

### 交付前断点

| 面板动作 | 返回值 | 效果 |
|---|---|---|
| 结束回合 | 让监听器返回 | 回合正常关闭 |
| 加一句并继续 | 让监听器 `agent.steer(message)` 后返回 | 回合读到新的 steering，再跑一步 |

交付前断点发生在最终回答已经写入 `assistant/message`、`turn/end` 还没发生的位置。它不能改最终回答，只能选择“就这样交付”或“再加一句话继续”。这也是它不加 Stop 的原因：此时回合本来就要结束。

## 参数预览

工具暂停时，面板不再把所有参数一律摊成 JSON：

- `edit`：`file_path` + `old_string`/`new_string` 的行级 diff，标注 `replace_all`；只做公共前缀/后缀 diff，不引 diff 库。
- `write`：`file_path`、行数、最多 6000 字符的正文预览。
- `apply_patch`：patch 文本，最多 8000 字符。
- 其他工具：有 `command` 时显示命令，否则回退到 pretty JSON。

预览只读冻结参数，不读磁盘、不改调用；超长内容会截断并标注。

## 为什么“改参数”不是静默改写

DSH 在进入 `tools/pre-execute` 前已经把参数深度冻结，并且 `tool/call` 事件已记录。框架明确禁止在这里改写输入（`PreToolDecision` 的注释：input rewriting is excluded because arguments are already logged and presented）。

所以静默改参数会同时破坏审计与模型认知。调试器选择**显式重发**：

- 原调用保留在日志里（被拒绝）；
- 新参数出现在拒绝理由里，模型据此重新发起一次调用；
- 代价是多一步，但每一步都可追溯。

这也是产品里最需要向用户解释的一点。

## 请求检查器

暂停面板下方是 **请求 / 来源 / 输出** 三个标签，按需加载 `/agent-debugger/api/inspect`，不把大提示词塞进每秒轮询的 state：

- **请求**：`request/header` 的完整 config 与 tool schema（name/description/parameters）；`system-prompt/assemble` 的 sections/contexts 全文；暂停时重建的消息序列（最近 24 条，每条最多 4000 字）。
- **来源**：段名、消息 `source.kind` 是真实来源；`request/header` **不含工具 owner**，所以工具只显示名字并标注“归属不可得”。
- **上一条结果**：`assistant/message` 的文本、工具调用、usage、finish（若提供）；`tool/call` 与 `tool/result` 按 `toolCallId` 配对，显示成功/失败与输出。

“完整”是相对存储上限而言：`maxPromptChars` 默认 200000 字符，超出会截断并在面板里标注。消息序列是从会话 surface 重建的，不是 provider 序列化后的逐字节请求；这一点不假装。

## 提示词检查器

`system-prompt/assemble` 的返回是 `PromptPresentation`：

- `sections: [{ name, text }]`：系统提示词段；
- `contexts: [{ name, text }]`：动态上下文；
- `variables`：插值变量名。

调试器只保留：

- 段名、字符数、最多 1200 字符的预览；
- 上下文名、字符数、最多 600 字符的预览；
- 变量名；
- 总字符预算 `maxPromptChars`（默认 200000）。

这些只在内存里，不落盘、不联网。最近消息从 `session.deriveMessages()` 取最近 24 条，每条最多 4000 字符；这是模型可见历史，不是 provider 的逐字节序列化。

## 并发与顺序

- 一个会话同时只挂一个断点；第二个匹配调用直接放行（避免并行调用互相卡死）。
- 工具断点与审批可以叠加：调试器放行后，审批仍然会照常询问。
- 步骤断点发生在装配之后、`agent/pre-step` 的默认 decision 之后，所以看到的是最终消息。
- 逐步模式用 `once:false`，Continue 后下一步仍会停，直到 Stop/Off；超时会自动解除。`always` 模式会持续拦匹配工具，直到 `/debug off`。
- 交付前断点默认 one-shot；`once:false` 时每次回合结束都会停，直到 `/debug off`。它和工具断点共享同一个 `pending`，不会同时挂两个。

## 失败模式

- **页面关了**：断点等到超时后放行；逐步/工具超时会解除持续模式，交付前超时会正常结束回合，后续步骤不会每步再等 120 秒。`autoAllowAfterMs` 可调。
- **交付前拿不到最终回答**：`assistant/message` 还没被观察到时，面板显示“没有结果”，但仍可结束或加一句继续；不会跳过暂停。
- **steer 不可用**：`agent.steer` 不存在或抛错时，记一条诊断并让回合正常结束，不会伪造一条消息。
- **模型不按新参数重发**：拒绝理由要求它重发；如果它换方案，至少不会执行旧调用。
- **提示词快照缺失**：assembly 监听没跑过（例如刚装插件），面板只显示参数/消息。
- **子代理**：不会被主会话断点拦住；子代理有自己的 session。
- **工具名不匹配**：`tools` 默认只匹配 `bash,write,edit`；要拦 `apply_patch` 等需显式配置。
- **HTTP 未认证**：`connection.requestRejection` 拒绝，面板拿不到状态。

## 配置边界

- `autoAllowAfterMs` 最小 5000，避免误设成 0 导致断点形同虚设。
- `maxPromptChars` 最小 1000，最大 200000；超出预算的段只保留字符数，不保留预览。
- 断点历史最多 100 条。
