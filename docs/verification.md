# 验证记录

环境：DeepSeek Harness Desktop `0.2.2-rc.3`，profile `desktop`，会话工作区
`/Users/rodin/Workspace/dsh-plugin`。最后更新：2026-11-14，插件 `0.2.0`。

## 当前结论

- **自动测试**：插件 64 pass，工作区 150 pass。
- **真实 GUI 已验证**：步骤断点能在真实回合里暂停，显示暂停面板、自动放行倒计时和
  Continue / Add guidance / Stop turn；暂停确实阻塞 Agent。
- **尚未在真实 GUI 验证**：工具断点的放行/改参数/跳过/停止、步骤注入后续跑、
  交付前断点的结束/`agent.steer` 续跑、`edit` diff 的实际渲染、深色主题/窄屏。
- 完整的逐轮截图反馈与修复记录已移到
  [verification-history.md](verification-history.md)。

## 安装与加载

```text
plugin_manager install_bundle /Users/rodin/Workspace/dsh-plugin/dsh-agent-debugger
→ stage: enable, enabled: true, application: applied, warnings: []
```

安装后探测浏览器 API：

```text
GET /agent-debugger/api/state?sessionId=probe  → 401 {"ok":false,"error":{"code":"forbidden"}}
GET /definitely-not-a-plugin/api/state           → 404
```

401 证明插件已加载、路由已注册，并且 `connection.requestRejection` 的认证栅栏生效；
未知路径仍是 404。

## 自动测试

```text
cd dsh-agent-debugger && npm test   → 64 pass
cd .. && make test                  → 150 pass
```

覆盖：

- 工具匹配（精确 / 前缀 / `*`）；
- 工具断点：放行、跳过、改参数重发、停止；
- 步骤断点：继续、加一句、停止；
- 交付前断点：结束、steer 一句、空指导、超时、abort、disarm、持久模式；
- 超时自动放行/结束、abort、disarm、stale id、一次只挂一个断点；
- 提示词预览上限、header 检查器、共享 prompt 预算；
- `normalizeMode` / `parseInstruction` / `formatState`；
- `edit` 行级 diff、`write` 行数与截断、`apply_patch`、未知工具回退、长 diff 截断；
- `PauseView` / `PauseActions` / Dock 动作 / 请求检查器的渲染测试；
- 清单、locale、icon、客户端注册、Dock 渲染冒烟。

## 真实 GUI

2026-11-14 09:5x 的一次真实回合里，步骤断点按设计暂停：

- 面板显示 **Paused before a model step**、`Auto-release in 84s`；
- 主操作是 **Continue / Add guidance / Stop turn**；
- 展开后能看到最终装配的系统提示词段；
- 倒计时和“暂停阻塞 Agent”都符合设计。

0.2.0 的交付前断点与参数预览目前只有单测和 stub 渲染覆盖，尚缺真实 GUI 走查。

## 0.2.0 状态

实现：

- `agent/turn-stopping` 监听器：调用 `engine.pauseFinish`；选择“加一句并继续”时用
  `agent.steer(createUserMessage(...))` 把 `agent-debugger` 来源的指导送回同一条回合。
- 引擎新增 `MODE.finish`：`pauseFinish`、`resolve('finish'|'steer')`；
  超时/abort/disarm 的安全默认都是结束回合；pending 记录里冻结最终回答文本、finish 和 usage。
- 客户端：侧栏空闲视图新增 **交付前**；暂停面板显示最终回答，动作只有 **结束回合** /
  **加一句指导**（没有 Stop）；Dock 可显示 finish pending 并直接结束。
- 参数预览：`edit` 行级 diff、`write` 路径/行数/正文、`apply_patch` patch 文本；
  其他工具回退 JSON。纯客户端、只读冻结参数、不读磁盘。

尚未验证（需要真实 GUI / 真实回合）：

- 在真实回合的 `turn-stopping` 点暂停、点击“结束回合”后正常关闭；
- 点击“加一句指导”后 `agent.steer` 是否真的让同一回合再跑一步；
- 侧栏最终回答区、diff 颜色与 180px 滚动区的实际渲染；
- 关闭页面后 finish 超时是否按预期结束回合；
- 超时自动放行/结束在真实回合中的表现（单测覆盖了 40ms 版本）；
- 深色主题、窄窗口下的最终视觉。

## 一个必须记录的 DSH 约束

`ToolExecution.arguments` 在 `tools/pre-execute` 前已深度冻结，`PreToolDecision` 明确排除输入改写。
因此“改参数”不是静默替换，而是：

1. deny 原调用；
2. 在拒绝理由里给出原参数、新参数与“用新参数重发”的指示；
3. 模型重新发起调用。

单测 `edit resolves with a guided-retry reason, not a silent rewrite` 锁住了这个语义。
产品上必须继续如实描述，不能把它说成“直接改参数”。

## 安全与边界

- 断点只在内存；提示词/消息/参数不落盘、不联网。
- 默认不拦；只有用户 arm 或调用 `/debug` 才暂停。
- 超时默认 120 秒；关掉页面不会永久挂死 Agent。
- 子代理会话需要单独 arm。
- `edit`/`write` 预览只基于冻结参数，不读磁盘，也不是磁盘真实 diff。
