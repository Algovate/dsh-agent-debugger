# 智能体调试器 · Agent Debugger

[![CI](https://github.com/Algovate/dsh-agent-debugger/actions/workflows/ci.yml/badge.svg)](https://github.com/Algovate/dsh-agent-debugger/actions/workflows/ci.yml)

> **在 Agent 动手或交付之前，先看清它要做什么。** 给模型步、下一个工具调用或回合结束设断点：暂停、看提示词/参数/最终回答、改一句或改参数、再继续。

现在的 Agent 工具有三种：能看到过程的（trajectory、replay）、能审批权限的（approval）、能事后回放的（session log）。没有一种能**在动作发生或交付前停下来，让你看清并改变它**。

智能体调试器补的就是这一层：

- **逐步断点（模型步）**：在 Agent 每一次模型调用前暂停，展示最终装配的系统提示词段、最近的模型可见消息、模型与工具面；你可以继续、加一句再继续，或停止回合。**逐步是持续模式**：Continue 后下一步仍会停，Stop/Off 才退出；超时会自动解除，避免无人值守时每步等 120 秒。
- **下一个工具断点**：在匹配的工具调用执行前暂停，展示它已经冻结的参数；你可以放行、跳过、改参数重发，或停止回合。
- **交付前断点**：在 Agent 即将关闭回合时暂停，展示本回合的最终回答；你可以结束回合，或加一句指导让它再跑一步。超时自动结束，不会把回合挂死。
- 每个断点都是一个真正的暂停：Agent 在等你，直到你操作或超时。

## 20 秒演示

1. 输入框上方点 **下一个工具**（或 `/debug tool`）。
2. Agent 调 `bash` 前停住，**右侧栏自动打开「调试器」**：`bash`、完整参数、最近提示词段。
3. 把 `rm -rf build` 改成 `rm -rf dist`，点 **改参数重发**。
4. Agent 收到一条明确的拒绝理由和“用这组新参数重新调用”的指示，重新发起调用；这次执行的是 `dist`。

## 一个必须说清的边界

DSH 在 `tools/pre-execute` 之前就冻结并记录了工具参数，插件**不能静默改写**已经记录的调用。所以“改参数”实现为：

1. 拦下原调用（deny）；
2. 把“原参数 / 新参数 / 请用新参数重发”写进模型可见的拒绝理由；
3. 模型用新参数重新调用。

这不是伪造历史，也不是静默替换；代价是多一次模型步。面板里会明确写出这一点。

## 使用面

| 面 | 能做什么 |
|---|---|
| Dock（输入框上方） | **逐步模式**、**下个匹配工具**、**关闭**、**打开面板**；暂停时显示步号/工具名/回合结束 + 自动放行/结束倒计时，并提供最小的放行/继续/结束兜底 |
| 右侧栏「调试器」标签页 | 完整暂停面板：工具放行 / 改参数重发 / 跳过 / 停止；下一步 / 跑完本回合 / 加一句并继续 / 停止；交付前结束回合 / 加一句继续；请求/来源/结果标签页，带搜索、消息角色筛选、展开全部和复制完整请求 |
| `/debug` | `status`、`step`、`tool`、`finish`、`always`、`off` |

### 为什么放侧栏

暂停时要同时展示“待执行的动作”和“提示词/参数”，弹窗会跟视口高度、输入框抢空间，矮窗口下按钮会被切。侧栏是常驻的，暂停时自动打开该标签，对话仍然可见；关掉标签也能从 Dock 重新打开。

面板按“先结论、后细节”排：顶部是待执行动作和对应按钮；下面直接是 **请求 / 来源 / 输出** 三个标签（请求会随时机显示“下一步/上一次”，输出是当前可用的最新结果），不再藏在三级折叠里。

- **请求**：标签会随断点时机变化——step 暂停显示 **下一步请求**（尚未发送的预览，header/工具可能来自上一步），tool/finish 暂停显示 **上一次请求**（已发送）。内容：模型与参数、完整工具 schema、系统段/上下文全文、消息序列。顶部有搜索框、消息角色筛选（全部/你/模型/工具/上下文）和 **展开全部段落与消息**；命中项自动展开，不用逐个点。工具 schema 仍单独点开，避免一次铺 30 份参数。
- **来源**：段名即贡献者；消息的 `source` 是生产者；工具 owner 不在 `request/header` 里，明确标“不可得”，不猜。
- **结果**：上一条 assistant 的文本/工具调用/finish/usage，以及上一条 tool call/result（成功/失败/输出）。

请求全文通过独立的 `/agent-debugger/api/inspect` 拉取，不进入每秒轮询的状态；内存上限由 `maxPromptChars` 控制。

面板基于 **dsh-better-sidebar** 的标签页（当前 profile 已安装）。没有它时，Dock 仍能放行、继续或结束，不会把 Agent 卡死；只是没有完整的暂停与检查器面板。

## 配置

| 键 | 默认 | 含义 |
|---|---|---|
| `tools` | `bash,write,edit` | 工具断点匹配的名字或前缀（`write*`），逗号分隔；`*` 匹配全部 |
| `autoAllowAfterMs` | `120000` | 超时自动放行/结束，避免关掉页面后把 Agent 挂死 |
| `maxHistory` | `20` | 每会话保留的断点记录 |
| `maxPromptChars` | `200000` | 完整请求文本的内存上限（超出截断，只在内存） |

```yaml
- id: agent-debugger
  name: 'dsh-agent-debugger'
  config:
    tools: 'bash,write,edit,apply_patch'
    autoAllowAfterMs: 60000
```

## 安全与边界

- **默认不拦**：只有你点断点或输入 `/debug` 才暂停。
- **一次一个**：同一会话同时只挂一个断点；并发工具调用只有第一个匹配的会停。
- **会阻塞**：断点会阻塞 Agent；工具/步骤超时自动放行，交付前超时自动结束回合，默认 120 秒。
- **只在内存**：提示词预览、最近消息、参数都不落盘、不联网；页面 API 走 `connection.requestRejection`。
- **子代理独立**：断点只作用于被 arm 的会话；子代理有自己的 session，不会被主会话的断点拦住。
- **不静默改历史**：工具参数只能“拒绝 + 指示重发”；步骤或交付前加的 instruction 是一条带 `agent-debugger` 来源的 user 消息，模型能看到，但不会重写既有历史。
- **预览只读**：`edit`/`write` 的 diff 和内容预览只基于已冻结参数，不读磁盘、不改调用；超长内容会截断。

## 安装

```sh
dsh plugin --profile desktop add dsh-agent-debugger
```

本地开发把包名换成本地目录。装完新开会话，输入框上方出现 **智能体调试器**；右侧栏的 **+** 菜单里也会出现 **调试器**。
要完整面板，请同时安装 `dsh-better-sidebar`（当前 profile 已装）。

## 测试

```sh
cd dsh-agent-debugger && npm test
```

覆盖：断点匹配、工具放行/改参数/跳过、步骤注入、交付前结束/加一句、超时、abort、disarm、stale id、提示词预览上限、header 检查器、`edit`/`write` diff 预览、清单与客户端注册。

验证记录见 [docs/verification.md](docs/verification.md)；逐轮截图历史见 [docs/verification-history.md](docs/verification-history.md)。
接缝语义与失败模式见 [docs/DETAIL.zh.md](docs/DETAIL.zh.md)。
安全报告见 [SECURITY.md](SECURITY.md)；发布清单见 [docs/RELEASE.md](docs/RELEASE.md)。

## 机制地图

| DSH 机制 | 落点 | 作用 |
|---|---|---|
| `agent/pre-step` waterfall | `index.js` | 在模型步前进出；可加一条 instruction 或拒绝 |
| `tools/pre-execute` waterfall | `index.js` | 在工具执行前停下；allow / deny / cancel |
| `agent/turn-stopping` serial | `index.js` | 在回合关闭前停下；结束或 steer 一句继续 |
| `agent.steer` | `index.js` | 把交付前的指导送回同一条回合 |
| `system-prompt/assemble` | `index.js` | 记录最终装配的段名与预览 |
| `request/header` | `index.js` | 记录模型与工具面 |
| Cordis `Service` | `ctx.agentDebugger` | per-session 断点状态 |
| Slash command | `/debug` | 人手控制 |
| HTTP + Connection 准入 | `/agent-debugger/api/*` | Dock/面板的 state/arm/disarm/resolve |
| Slot + 主题 + i18n | `conversation.input.dock` | 紧凑状态行 + 暂停面板 |
| 只读参数预览 | `client.js` | `edit` 行级 diff、`write` 内容预览、`bash` 命令 |

## 已知限制

- 不能直接编辑工具参数（DSH 冻结）；只能“拒绝 + 指示重发”。
- 不能编辑历史消息或系统提示词；步骤/交付前断点只能**追加**一条 instruction。
- 交付前断点不能改写已经生成的最终回答；只能结束回合，或加一句让它再跑一步。
- 提示词快照只保留最近一次装配，受 `maxPromptChars` 限制，面板里是有界预览。
- `edit`/`write` 预览是行级、基于冻结参数；不读当前文件，因此不是“磁盘真实 diff”。
- 关闭页面后断点会一直等到超时；建议把 `autoAllowAfterMs` 调小。
- 子代理不会被主会话断点拦住；需要单独 arm 它的会话。

## 路线图

1. **失败断点**：`tools/post-execute`，在模型读到工具错误之前暂停，继续 / 补一句 / 停止。
2. **条件断点**：最小子串匹配（`{ tool: bash, contains: [...] }`），先配置、后 UI；不做正则/表达式。

暂不做：断点历史回放 / 从断点 fork、编辑系统提示词段、批量断点与步过/步入。它们需要持久化、分支或改写冻结请求，和“实时拦截一个动作”的核心离得太远。
