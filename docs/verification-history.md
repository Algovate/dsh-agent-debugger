# 验证历史（0.2.0 之前）

本文件保留 2026-11-14 的逐轮截图反馈与修复记录，用于追溯当时的界面问题与决策。
历史里的 pass 数只代表当时状态；当前状态与 0.2.0 验证见 [verification.md](verification.md)。

## 真机 GUI（用户提供截图，2026-11-14 09:5x）

步骤断点已在真实回合里触发：面板显示 **Paused before a model step**、`Auto-release in 84s`、
`Continue / Add & continue / Stop turn`，以及展开后的装配提示词段。倒计时和“暂停阻塞 Agent”都按设计工作。

从截图发现并修复了三个可见问题：

1. **0 字符段全部列出**：24 段里有多段 `0 chars`。现在只显示非空段，并标注“N 个空段已隐藏”。
2. **卡片贴着视口底部**：改为 `max-height:min(86vh,780px)`，头部与操作栏固定，中间内容独立滚动；操作按钮不再随长提示词滚走。
3. **最近消息没显示**：`agent.session.events` 可能取不到本步 claimed 消息；现在把 session 历史与 `decision.messages` 合并去重后再展示。

另外把 instruction 的占位文案从“重复标签”改成示例，并注明提示词段是插值前原文。

修复后的界面尚未重新截图。

## 第二次反馈：仍然难懂（2026-11-14 10:0x）

截图 #2 显示第一轮修复后的面板：`Recent messages` 里是 `user · user · 11 chars`，中间一个巨大的空文本框，
`Assembled prompt` 折叠着，主操作和次要操作视觉权重接近。用户反馈“看不清楚，很难看懂”。

重做为“先结论、后细节”：

- 卡片收窄到 560px；标题 **Agent paused** + 一句“它即将进行下一步推理；你选择之后才会继续”；
  倒计时改成右上角 pill。
- 默认只显示 **你的消息** 引用块；工具断点显示工具名和参数预览。
- 主操作改为实心按钮 **Continue / Run it**；“Add guidance / Edit arguments”点开才出现小编辑器，
  不再默认铺一个 300px 高的文本框。
- 去掉 `user · user · 11 chars` 这类元数据；消息只在“详情”里出现。
- 0 字符段隐藏，技术计数与段预览全部收进折叠的“详情”；补一句“改参数是拒绝并重发”的说明。
- 提高对比与字号：标题 17px、引用 14px、主按钮实心。

修复后的界面尚未重新截图。

## 第三次反馈：矮窗口看不全（2026-11-14 10:1x）

截图 #3 是 2944×556 的超宽横条：面板中段可见，但底部三个按钮只露出一点，被视口切掉。

修复：

- 卡片最大高度从固定 `82vh` 改为 `calc(100dvh - 32px)`，随窗口高度收缩。
- `@media (max-height: 720px)`：居中弹窗改为**贴底面板**（`align-items:flex-end`），
  按钮贴着视口底部，不会被窗口高度切掉；上方对话仍然可见。
- `@media (max-height: 540px)`：进一步收紧 padding/gap/字号/按钮，副标题缩短为一行；
  头部与操作栏固定，中间内容独立滚动。
- 标题与副标题不再换行成两大段；矮窗口下也能一眼看到“发生了什么 + 点哪个”。

修复后的界面尚未重新截图。

## 第四次反馈：放侧边栏（2026-11-14 10:2x）

截图 #4 是 2590×671 的横条：改为贴底面板后按钮仍被视口底部切掉。用户判断“这个位置没戏，放侧边栏”。

改为常驻侧栏，不再和视口抢空间：

- 暂停 UI 迁到 **dsh-better-sidebar** 的标签页：`registerTab({ id: 'agent-debugger', single: true })`，
  标题“调试器”；暂停时 Dock 自动 `openTab` 打开。
- 移除弹窗；Dock 只保留 arm、状态、打开面板，以及暂停时的“放行/继续/停止”最小兜底，
  保证侧栏不可用或标签被关掉时 Agent 不会卡死。
- 面板内是完整操作：消息引用、工具参数、改参数/加指导（点开才出现编辑器）、详情里的提示词和最近对话。
- 没有 `dsh-better-sidebar` 时：Dock 仍能放行/停止，只是没有完整面板。

修复后的界面尚未重新截图；侧栏标签的实际渲染需要在 GUI 里验证。

## 第五次反馈：信息太密、读着费劲（2026-11-14 10:3x）

截图 #5 是侧栏面板：功能已经对了，但“详情”展开后 10 个系统段全文铺满整栏，行宽过大，读起来像日志。

只做减法：

- 侧栏内容限制阅读宽度（`max-width:720px` 居中），宽侧栏不再拉出超长行。
- “详情”默认收起；展开后每个系统段只显示“段名 + 字符数”，点开单段才看正文。
- 顶部计数从“10 个非空系统段 · 5517 字符 · 6 个空段已隐藏”缩成“10 个系统段 · 5517 字符”。
- “最近对话”也改成独立折叠，且没有内容时不再占位。
- 标签标题从 `Debugger` 缩成 `Debug` / `调试`，避免被标签条截断。
- 提高小标签对比度，但保持原有排版与主题 token，不引入新视觉元素。

修复后的界面尚未重新截图。

## 第六次：补齐请求/来源/结果（2026-11-14 10:4x）

按用户三个问题补齐检查器，全部收进折叠块，不改主界面：

- **完整请求**：`request/header` 的 config 与完整 tool schema；`system-prompt/assemble` 的 sections/contexts 全文；暂停时重建的最近 24 条消息（每条最多 4000 字）。全文通过 `/agent-debugger/api/inspect` 按需拉取，不进入 900ms 轮询。
- **来源**：段名、消息 `source.kind`；工具 owner 明确标注“不可得”，不伪造插件归属。
- **上一条结果**：`assistant/message` 的文本/工具调用/usage/finish，以及按 `toolCallId` 配对的 `tool/call` + `tool/result`（成功/失败/输出）。
- `maxPromptChars` 默认从 16000 提到 200000（内存上限，超出截断并标注）。
- 新增引擎单测覆盖请求快照与结果配对（27 pass）。

尚未重新截图；侧栏展开后的实际密度需要 GUI 确认。

## 第七次：“下一步”不继续停 + 请求检查器为空（2026-11-14 10:5x）

截图 #7：断点确实停在一次“无新消息”的 continuation step，但 Request 里 `config: null`、Tools 0、Messages 0；点 Continue 后又不再停。

两个根因：

1. **一次性断点**：Continue 解决后 `once` 把逐步模式 disarm 了。现在 **逐步模式默认持久**（`once:false`），Continue/Add guidance 后下一步继续暂停；Stop turn / 关闭才退出。
2. **检查器数据源**：`request/header` 只在变化时记录，插件重载后可能没有新事件；现在暂停时用 `agent.session.requestHeader()` 播种当前 header。消息原来读 `agent.session.events`（不可用），现在改用 `session.deriveMessages()` 的模型可见历史。

行为说明：如果 Continue 时回合已经结束，就没有“下一步”可停；下一次发消息时会在第一步暂停。Dock 会显示待命。

修复后的界面尚未重新截图。

## 第八次：检查器空值的回退与明示（2026-11-14 11:0x）

用户再次贴出同一张截图（sha256 与截图 #7 相同），它仍是第七次修复前的画面。为排除“刷新了但取不到”的情况：

- `requestHeader` 既支持方法也支持属性；取不到时面板不再静默显示 `null`，而是写“未捕获到 request/header；requestHeader() 为空”。
- `deriveMessages()` 为空时回退到 `session.surface.events` 的 surface 消息；仍为空则写“消息历史为空”。
- 这样下一张截图能直接区分“bundle 没刷新”“requestHeader 不可用”“历史为空”三种情况。

尚未重新截图。

## 第九次：Armed 但回合未暂停（2026-11-14 11:1x）

截图 #9：回答已经 `Completed in 2s`，Dock 显示 `Armed · pause at every step`，但没有暂停。

两种解释，代码都做了处理：

1. **断点是在回合结束后才设置的**：已完成的回合没有“下一步”；下一条消息的第一步才会停。
2. **检查器捕获抛错把暂停跳过了**：之前 `readRequestHeader` / `deriveMessages` / `setRequestMessages` 和 `pauseStep` 在同一个 try 里，前者抛错会 return decision。现在拆成三个 try：header 失败、messages 失败都不影响暂停；只有 `pauseStep` 自身失败才放行，并把原因写进 `diagError`，Dock 会显示。
3. 顺手修了 Dock 的 `Armed  Armed: ...` 重复：状态行是 `Armed`，meta 现在只写 `pauses at every step`。

需要重新截图确认。

## 第十次：Your message 显示成 system-reminder（2026-11-14 11:2x）

截图 #10：暂停面板的“Your message”展示的是 `<system-reminder>` 运行时上下文，不是用户消息。

原因：面板取“最后一条 user 角色消息”，而运行时上下文也是 user 角色。修复：

- 只取 `source.kind === 'user'`（或没有 source）的消息；
- 对预览去掉 `<system-reminder>…</system-reminder>` 块，剩下的才是人类文字；
- 去掉后为空则显示“没有新消息，它将继续当前回合”；
- 完整请求的 Messages 列表仍保留 system-reminder（检查器要完整），只是主视图不拿它当“你的消息”。

尚未重新截图。

## 第十一次：面板重构（2026-11-14 11:3x）

用户要求重新设计面板。重构为：

- 顶部：暂停标题、一句说明、倒计时；
- 中部：你的消息 / 工具调用 + 主操作；
- 下方：**请求 / 来源 / 结果** 三个标签（不再是 Details 里套三层 details）；
- 请求里模型、工具、系统段、上下文、消息各一行，默认收起，点开看全文；
- 来源是摘要（段名、消息 source、工具名 + owner 不可得）；
- 结果拆成“上一条回复”和“上一条工具结果”两张卡；
- Dock 保持原样，侧栏自动打开不变。

只用了既有主题 token，没有新增装饰。尚未重新截图。

## 第十二次：空段计数（2026-11-14 11:4x）

Request/Sources 的“系统段”数字原来包含 0 字符段，容易误读。现在：

- 摘要写 `24 System sections (18 non-empty)`；
- 段列表只列非空段，并注明 `6 empty sections hidden`；
- Sources 标签同样只列非空段。

尚未重新截图。

## 第十三次：Messages 里的 tool 名称（2026-11-14 11:5x）

Messages 里的工具结果原来只显示 `tool · tool`。现在：

- `previewSession` 从 `ToolMessageSource.callId` 带上 `toolCallId`；
- 引擎在 `tool/call` 事件里维护 `callId → name` 映射；
- `/inspect` 给每条 tool 消息补 `toolName`；
- 面板显示 `tool · tool · bash · N chars`；映射不到时显示 callId 前 8 位。

映射来自真实 `tool/call`，不猜。新增单测覆盖（30 pass）。

## 第十四次：一键展开（2026-11-14 12:0x）

用户反馈“一个一个展开看，好累”。Request 标签顶部新增 **展开全部段落与消息 / 收起全部**：

- 一次打开模型、工具列表、系统段、上下文、消息的顶层行；
- 系统段/上下文/消息的每一条也同时展开，形成连续可读文本；
- 工具 schema 的二级行仍保持收起，避免 30 份参数一次铺开；
- 默认仍是收起；手动展开的行不会被轮询强制关闭（`open` 只在 expandAll 时受控）。

尚未重新截图。

## 第十五次：过滤与搜索（2026-11-14 12:1x）

用户问“有没有更好的查看方式，或者过滤”。Request 标签新增：

- 全局搜索框：按名称或正文过滤工具、系统段、上下文、消息；命中项自动展开；
- 消息角色 chips：全部 / 你 / 模型 / 工具 / 上下文，带数量；选一个只展开该类消息；
- 原有的“展开全部段落与消息”保留；
- 过滤时行摘要显示 `命中 / 总数`，无命中显示“没有匹配项”；
- 手动展开的行仍不会被轮询强制关闭。

尚未重新截图。

## 第十六次：评审问题全修（2026-11-14 12:3x）

按评审修：

- **P0 逐步超时**：`timeout` 现在会 disarm；无人值守时最多卡一次 120 秒，不会每步都等。
- **P1 命名**：Dock/面板按钮从“下一步”改为“逐步 / Step”，避免被当成 one-shot。
- **P1 回合结束**：监听 `turn/end` / `turn/start`，armed 时显示“上回合已结束；发消息后第一步暂停”。
- **P1 观察器兜底**：`session/event` 的 `observeEvent` 包了 try/catch。
- **P1 消息归属**：claimed 消息打标；主视图只把本步新消息当“Your message”，否则显示“没有新消息”。
- **P2 finish**：从 assistant stream 的 `finish` chunk 提取，Result 不再永远是 `—`。
- **P2 错误边界**：侧栏面板包了 `PanelBoundary`，渲染失败显示可读错误而不是空白。
- **P2 重试上限**：自动打开侧栏最多重试 3 次。
- **P2 内存**：会话状态超过 50 个时淘汰未 armed/unpending 的旧状态。
- **P2 仓库地址**：`algovate/dsh-agent-debugger` 返回 404，已移除 repository/homepage/bugs，待真正建仓后再加。
- 测试：新增 timeout disarm、turnEnded、finish 提取；共 33 pass。

尚未重新截图。

## 第十七次：preview 抽取与打包白名单（2026-11-14 12:5x）

- `previewSession` / `previewMessages` / `mergePreviews` / `blocksText` 抽到纯模块 `preview.js`，用 fake agent 覆盖 claimed 标记、去重升级、toolCallId、surface 回退。
- 发现并修复 `previewMessages` 丢失 `chars` 参数与 `claimed` 标记的回归（会让“Your message”永远显示“没有新消息”）。
- `preview.js` 加入 `package.json` 的 `files` 白名单；`npm pack` 16 文件。
- 新增“runtime modules are packed”测试。当前 38 pass，工作区 124 pass。

## 第十八次：最后两个真实需求（2026-11-14 13:0x）

只做两个不增加负担的改进：

- **复制请求**：Request 工具栏一键复制完整 JSON（config、tools、sections、contexts、messages、truncated），用于分享/存档；失败显示“复制失败”。
- **当前步号**：暂停面板副标题显示 `· 步骤 N`，不再只有“下一步”。

明确拒绝：主题、时间线/回放、自动改 prompt、多会话仪表盘、工具选择器 UI、快捷键。它们要么是装饰，要么会重新增加认知负担。

当前 38 pass / 工作区 124 pass。尚未重新截图。

## 第十九次：面板手感（2026-11-14 13:1x）

不新增模块，只修交互：

- 长消息引用限高 180px、内部滚动，主操作不被挤到屏幕外；
- 每次新暂停把面板滚回顶部，不再沿用上一次的滚动位置；
- 编辑参数/加指导支持 `⌘/Ctrl+Enter` 提交、`Esc` 取消；
- 重新打开编辑器时重置草稿：改参数回到当前参数，加指导从空白开始，避免把 JSON 带进指导框。

当前 38 pass / 工作区 124 pass；尚未重新截图。

## 第二十次：Request 标签的时机歧义（2026-11-14 13:2x）

用户指出“Request 与触发时机可能误解”。确实：

- step 暂停时请求还没发出，header/tools 可能来自上一步；
- tool 暂停时看到的是已经发出的上一次请求。

修复：

- 标签动态：step → **下一步请求**，tool → **上一次请求**；
- 标签顶部加一句时机说明（“尚未发送预览” / “来自上一次已发送请求”）；
- 删掉 Model 行里重复的 header 说明，避免同一件事说两遍。

当前 38 pass / 工作区 124 pass。

## 第二十一次：三个标签的维度（2026-11-14 13:3x）

用户指出 Request/Result/Sources 的时机与语义不对称：

- Request 是输入侧，随断点时机变化（step 下一次 / tool 上一次）；
- Result 不是统一的“上一次”：step 暂停是上一步，tool 暂停的 assistant 卡是当前回复；
- Sources 不是 resources，是 provenance。

修复：

- `Result` → **Output / 输出**，卡片仍写“Last assistant / Last tool”并在顶部注明当前可取到的最新输出；
- `Sources` → **Origins / 来源**，说明是 provenance 而非文件/资源；
- 保留动态的 `Next request / Last request`。

当前 38 pass / 工作区 124 pass。

## 第二十二次：两行维度标签（2026-11-14 13:4x）

用户问能否更明显地区分三个标签。改成两行：

- 上行是维度：`INPUT` / `PROVENANCE` / `OUTPUT`（中文：输入 / 来源说明 / 输出侧）；
- 下行是内容：`Next request` 或 `Last request` / `Origins` / `Latest output`；
- 选中标签有 2px 主题色下划线，未选中只有次级文字。

没有加颜色编码或图标：维度文字本身已经足够区分，颜色编码会变成装饰，也对色觉不友好。

当前 38 pass / 工作区 124 pass。

## 第二十三次：把 PROVENANCE 说人话（2026-11-14 14:0x）

用户问 PROVENANCE 什么意思。保留概念，但 UI 不再用这个词：

- 英文维度：`PROVENANCE` → `WHERE FROM`；
- 中文维度保持“来源说明 / 来源”；
- 说明文字从“Provenance, not files...”改为“Where each part came from, not files...”；
- 中文说明改为“来源（出处）”。

当前 38 pass / 工作区 124 pass。

## 第二十四次：Dock 语义与反馈（2026-11-14 14:1x）

截图 `Off Tools: 30` 暴露两个问题：

- `Off Tools` 看起来像一个词，状态与 meta 没有分隔；
- `30` 是上一次请求的工具总数，不是断点匹配的工具，放在 Dock 会误导。

修复：

- `Off · 匹配工具: bash, write, edit`，Dock 不再显示请求工具总数（Details 里叫“请求工具”）；
- pending meta：`步骤 N · 自动 74s` / `工具调用: bash · 自动 74s`；
- `Step` → **逐步模式 / Step mode**，`Next tool` → **下个匹配工具 / Next match**，加 `aria-pressed`；
- 面板 step 主按钮 `Continue` → **下一步 / Next step**，新增 **跑完本回合 / Run to end**；
- pending 时 Dock 也显示操作错误；
- **P0**：pending 时 `arm` 不再 settle/放行，改为拒绝并写 `diagError`；`/debug step|tool|always` 返回错误。

测试新增“arming while pending does not release it”；39 pass / 工作区 125 pass。

## 第二十五次：左侧图标（2026-11-14 14:2x）

用户问左侧图标为什么一直是暂停。原因：它是静态品牌图标（两竖），不是状态；状态由圆点和 Off/Armed/Paused 文字表示。放在 “Off” 旁边会被读成“当前暂停”。

修复：Dock 左侧图标改为**断点图标**（圆环 + 中心点），状态中性；圆点继续承担 Off/Armed/Paused 的状态。

当前 39 pass / 工作区 125 pass。

## 第二十六次：Step mode / Next match 点击无反馈（2026-11-14 14:3x）

截图里 Step mode 是实心蓝、Next match 是描边、Off 发灰。两个问题：

- 面板空闲态的 Step mode 之前**永远**是实心主按钮，看起来像“已选中”，实际 Off；点击后只有上方副标题变，按钮不变。
- Next match 即使激活也没有视觉变化。

修复：

- 两个模式按钮**只有激活时才实心**，未激活都是描边；
- 加 `aria-pressed`；
- 按钮下面加常驻状态：`逐步模式已开启…` / `下个匹配工具已开启，等待：…` / `调试器未开启`；
- Dock 的激活按钮也改为实心，和面板一致。

当前 39 pass / 工作区 125 pass。

## 第二十七次：空闲提示与状态行（2026-11-14 14:4x）

- 空闲提示仍写“下一步 / 下个工具”，与按钮新名字“逐步模式 / 下个匹配工具”不一致；已改。
- 模式状态行从 tertiary 10px 的 `ad-note` 提到 secondary 11px 的 `ad-text`，让“已开启/未开启”更容易看见。

当前 39 pass / 工作区 125 pass。
