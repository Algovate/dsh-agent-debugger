/**
 * Agent Debugger — browser half.
 *
 * Two surfaces:
 * - a composer dock that arms one-shot breakpoints and jumps to the panel;
 * - a persistent right-sidebar tab (dsh-better-sidebar) that owns the pause UI.
 *
 * The panel is a normal sidebar page, so it never fights the viewport height
 * and the conversation stays visible. The dock keeps a minimal release action
 * so a missing sidebar can never trap the agent.
 */
window.__ModuleLoader__.load({
  id: 'dsh-agent-debugger',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'agent-debugger'
    /** Set while the dock is mounted; the sidebar tab has no slot-injected translator. */
    let translate = (key) => (typeof en === 'object' ? en[key] ?? key : key)
    /** Set once the sidebar service is available. */
    let openSidebarTab = () => false

    /** Simplified Chinese dictionary. */
    const zh = {
      label: '智能体调试器',
      tabTitle: '调试',
      tabDesc: '断点、提示词与工具调用的暂停面板',
      loading: '加载中',
      off: '未开启',
      armed: '待命',
      paused: '已暂停',
      step: '下一步',
      stepMode: '逐步模式',
      finishMode: '交付前',
      finishModeOn: '交付前断点已开启：Agent 结束回合前会暂停。',
      armedForFinish: '暂停于回合结束前',
      pausedFinishSub: '它即将结束本回合；先看最终回答，再决定。',
      finalAnswer: '最终回答',
      finishTurn: '结束回合',
      finishHint: '结束会正常关闭回合；加一句指导会让它再跑一步。',
      finishGuideHint: '这句话会作为下一条用户消息，让它继续一步。',
      resultNoteFinish: '这是本回合的最终输出；结束前可以检查。',
      replaceAll: '全部替换',
      diffTruncated: '差异过长，已截断',
      noDiff: '没有行级差异',
      linesLabel: '行',
      contentPreview: '内容预览',
      emptyFile: '空文件',
      patchLabel: '补丁',
      contentTruncated: '内容过长，已截断',
      nextStep: '下一步',
      runToEnd: '跑完本回合',
      stepModeOn: '逐步模式已开启：每个模型步都会暂停。',
      toolModeOn: '下个匹配工具已开启，等待：',
      modeOff: '调试器未开启。',
      auto: '自动',
      autoFinish: '自动结束',
      requestToolsLabel: '请求工具',
      turnEnded: '上回合已结束；发消息后第一步暂停。',
      panelCrashed: '面板渲染失败',
      copyRequest: '复制请求',
      nextRequest: '下一步请求',
      lastRequest: '上一次请求',
      requestPreviewNote: '尚未发送；这是下一步模型请求的预览。header/工具可能来自上一步。',
      requestSentNote: '这次工具调用来自上一次已发送的请求；当前没有待发送的模型请求。',
      requestFinishNote: '这是上一次已发送请求之后的回合结束点；当前没有待发送的模型请求。',
      copied: '已复制',
      copyFailed: '复制失败',
      stepNumber: '步骤',
      editorKeys: '⌘/Ctrl+Enter 继续 · Esc 取消',
      tool: '下个匹配工具',
      disarm: '关闭',
      details: '详情',
      hide: '收起',
      openPanel: '打开面板',
      armedForStep: '暂停于每一步',
      armedForTool: '暂停于下个匹配工具',
      toolsList: '匹配工具',
      model: '模型',
      tools: '工具',
      history: '最近断点',
      noHistory: '还没有断点记录',
      hint: '断点会阻塞 Agent，超时自动放行/结束。',
      panelHint: '在输入框上方点“逐步模式”或“下个匹配工具”；交付前断点在侧栏或 /debug finish 开启。',
      sidebarUnavailable: '侧栏面板不可用，可直接在这里放行、继续或结束。',
      pollFailed: '无法读取调试器状态',
      pausedTitle: 'Agent 已暂停',
      pausedStepSub: '它即将进行下一步，等你选择。',
      pausedToolSub: '它即将调用工具，等你选择。',
      autoRelease: '自动放行',
      yourMessage: '你的消息',
      noNewMessage: '没有新消息，它将继续当前回合。',
      toolCall: '工具调用',
      runIt: '运行',
      editArgs: '改参数',
      runEdited: '用新参数运行',
      addGuidance: '加一句指导',
      addAndContinue: '加上并继续',
      cancel: '取消',
      continue: '继续',
      skip: '跳过',
      stop: '停止回合',
      promptSummary: '它将看到的提示词',
      request: '请求',
      sources: '来源',
      lastResult: '上一条结果',
      requestConfig: '模型与参数',
      requestTools: '工具',
      requestSections: '系统段',
      requestContexts: '动态上下文',
      requestMessages: '消息',
      sourceNote: '段名即贡献者；消息的 source 是生产者；工具 owner 不在 request/header 里。',
      ownerUnavailable: '工具归属不可得',
      loadingInspect: '正在读取完整请求…',
      noHeader: '未捕获到 request/header；requestHeader() 为空。',
      noMessagesInspect: '消息历史为空；deriveMessages() 未返回内容。',
      inspectFailed: '读取完整请求失败',
      truncated: '提示词超出存储上限，已截断',
      finish: 'finish',
      usage: 'usage',
      toolCalls: '工具调用',
      interrupted: '已中断',
      sectionsCount: '个非空系统段',
      hiddenEmpty: '个空段已隐藏',
      nonEmpty: '非空',
      expandAll: '展开全部段落与消息',
      filterPlaceholder: '过滤名称或内容…',
      clear: '清除',
      noMatch: '没有匹配项',
      messagesFilter: '消息',
      msgAll: '全部',
      msgUser: '你',
      msgModel: '模型',
      msgTool: '工具',
      msgContext: '上下文',
      collapseAll: '收起全部',
      conversation: '最近对话',
      editNote: '改参数会以“拒绝并重发”生效，不会静默改写已记录的调用。',
      instructionPlaceholder: '可选：只影响下一步的一句话',
      argsHint: '参数是 JSON；改完点“用新参数运行”。',
      invalidJson: '参数必须是合法 JSON',
      emptyArgs: '参数不能为空',
      emptyInstruction: '请先写一句要补充的话',
      actionFailed: '操作失败',
      noPreview: '（无预览）',
      tabRequest: '请求',
      tabSources: '来源',
      tabResult: '最新输出',
      captionInput: '输入',
      captionOrigins: '来源说明',
      captionOutput: '输出侧',
      idleTitle: '智能体调试器',
      idleHint: '在上方点“逐步模式”或“下个匹配工具”；交付前断点在下方按钮或 /debug finish 开启。',
      recent: '最近断点',
      noRecent: '还没有断点记录',
      modelParams: '模型与参数',
      toolsOwner: '工具归属不可得（request/header 不记录注册插件）。',
      sourcesNote: '来源（出处），不是文件/资源列表：段名是贡献者，消息 source 是生产者；工具 owner 不可得。',
      readOnly: '检查器只读；不会修改请求。',
      resultNoteStep: '当前 step 还没返回；这里是上一步的输出。',
      resultNoteTool: 'assistant 卡是请求这次工具调用的回复；tool 卡是上一条工具结果。',
      lastAssistant: '上一条回复',
      lastTool: '上一条工具结果',
      noResult: '还没有可展示的结果',
      noTool: '没有上一条工具结果',
      ok: '成功',
      error: '失败',
      noFields: '没有可展示的字段',
    }

    /** English dictionary. */
    const en = {
      label: 'Agent Debugger',
      tabTitle: 'Debug',
      tabDesc: 'Breakpoints, prompt and tool-call pause panel',
      loading: 'Loading',
      off: 'Off',
      armed: 'Armed',
      paused: 'Paused',
      step: 'Next step',
      stepMode: 'Step mode',
      finishMode: 'Before finish',
      finishModeOn: 'Finish breakpoint is on: the agent pauses before it closes the turn.',
      armedForFinish: 'pauses before the turn ends',
      pausedFinishSub: 'About to close the turn. Review the final answer first.',
      finalAnswer: 'Final answer',
      finishTurn: 'Finish',
      finishHint: 'Finish closes the turn; adding guidance runs one more step.',
      finishGuideHint: 'This becomes the next user message and runs one more step.',
      resultNoteFinish: 'This is the turn’s final output; review it before finishing.',
      replaceAll: 'replace all',
      diffTruncated: 'Diff truncated',
      noDiff: 'No line changes',
      linesLabel: 'lines',
      contentPreview: 'Content preview',
      emptyFile: 'Empty file',
      patchLabel: 'Patch',
      contentTruncated: 'Content truncated',
      nextStep: 'Next step',
      runToEnd: 'Run to end',
      stepModeOn: 'Step mode is on: every model step pauses.',
      toolModeOn: 'Next match is on; waiting for:',
      modeOff: 'Debugger is off.',
      auto: 'auto',
      autoFinish: 'Auto-finishes in',
      requestToolsLabel: 'Request tools',
      turnEnded: 'Turn ended; the next message pauses at step 1.',
      panelCrashed: 'The panel crashed',
      copyRequest: 'Copy request',
      nextRequest: 'Next request',
      lastRequest: 'Last request',
      requestPreviewNote: 'Not sent yet; this previews the next model request. Header/tools may lag one step.',
      requestSentNote: 'This tool call came from the last sent request; no model request is pending.',
      requestFinishNote: 'This is the turn end after the last sent request; no model request is pending.',
      copied: 'Copied',
      copyFailed: 'Copy failed',
      stepNumber: 'step',
      editorKeys: '⌘/Ctrl+Enter to continue · Esc to cancel',
      tool: 'Next match',
      disarm: 'Off',
      details: 'Details',
      hide: 'Hide',
      openPanel: 'Open panel',
      armedForStep: 'pauses at every step',
      armedForTool: 'pauses at the next matching tool',
      toolsList: 'Matched tools',
      model: 'Model',
      tools: 'Tools',
      history: 'Recent breakpoints',
      noHistory: 'No breakpoint yet',
      hint: 'A breakpoint blocks the agent; it auto-releases or finishes after the timeout.',
      panelHint: 'Arm “Step mode” or “Next match” above; arm the finish breakpoint from the panel or /debug finish.',
      sidebarUnavailable: 'The sidebar panel is unavailable; release, continue, or finish from here.',
      pollFailed: 'Could not read the debugger state',
      pausedTitle: 'Agent paused',
      pausedStepSub: 'About to take the next step. Choose what happens.',
      pausedToolSub: 'About to run a tool call. Choose what happens.',
      autoRelease: 'Auto-releases in',
      yourMessage: 'Your message',
      noNewMessage: 'No new message; it is continuing the current turn.',
      toolCall: 'Tool call',
      runIt: 'Run it',
      editArgs: 'Edit arguments',
      runEdited: 'Run edited call',
      addGuidance: 'Add guidance',
      addAndContinue: 'Add & continue',
      cancel: 'Cancel',
      continue: 'Continue',
      skip: 'Skip',
      stop: 'Stop turn',
      promptSummary: 'What it will see',
      request: 'Request',
      sources: 'Sources',
      lastResult: 'Last result',
      requestConfig: 'Model and parameters',
      requestTools: 'Tools',
      requestSections: 'System sections',
      requestContexts: 'Dynamic contexts',
      requestMessages: 'Messages',
      sourceNote: 'A section name is its contributor; a message source is its producer; tool ownership is not in request/header.',
      ownerUnavailable: 'tool owner unavailable',
      loadingInspect: 'Loading the full request…',
      noHeader: 'No request/header captured; requestHeader() returned nothing.',
      noMessagesInspect: 'Message history is empty; deriveMessages() returned nothing.',
      inspectFailed: 'Could not load the full request',
      truncated: 'Prompt exceeded the storage budget and was truncated',
      finish: 'finish',
      usage: 'usage',
      toolCalls: 'tool calls',
      interrupted: 'interrupted',
      sectionsCount: 'non-empty system sections',
      hiddenEmpty: 'empty sections hidden',
      nonEmpty: 'non-empty',
      expandAll: 'Expand all sections & messages',
      filterPlaceholder: 'Filter names or text…',
      clear: 'Clear',
      noMatch: 'No match',
      messagesFilter: 'Messages',
      msgAll: 'All',
      msgUser: 'You',
      msgModel: 'Model',
      msgTool: 'Tool',
      msgContext: 'Context',
      collapseAll: 'Collapse all',
      conversation: 'Recent conversation',
      editNote: 'Editing is applied as “deny and re-issue”, not a silent rewrite of the logged call.',
      instructionPlaceholder: 'Optional: one instruction for the next step',
      argsHint: 'Arguments are JSON; after editing, run the edited call.',
      invalidJson: 'Arguments must be valid JSON',
      emptyArgs: 'Arguments must not be empty',
      emptyInstruction: 'Write an instruction first',
      actionFailed: 'Action failed',
      noPreview: '(no preview)',
      tabRequest: 'Request',
      tabSources: 'Origins',
      tabResult: 'Latest output',
      captionInput: 'INPUT',
      captionOrigins: 'WHERE FROM',
      captionOutput: 'OUTPUT',
      idleTitle: 'Agent Debugger',
      idleHint: 'Arm “Step mode” or “Next match” above; arm the finish breakpoint below or with /debug finish.',
      recent: 'Recent breakpoints',
      noRecent: 'No breakpoint yet',
      modelParams: 'Model and parameters',
      toolsOwner: 'Tool ownership is not recorded in request/header.',
      sourcesNote: 'Where each part came from, not files or resources: a section name is its contributor, a message source is its producer; tool owner is not recorded.',
      readOnly: 'The inspector is read-only; requests are never modified.',
      resultNoteStep: 'This step has not returned; this is the previous output.',
      resultNoteTool: 'The assistant card requested this tool call; the tool card is the previous tool result.',
      lastAssistant: 'Last assistant reply',
      lastTool: 'Last tool result',
      noResult: 'No result to show yet',
      noTool: 'No previous tool result',
      ok: 'ok',
      error: 'error',
      noFields: 'Nothing to show',
    }

    /** Styles installed once and removed when the plugin unloads. */
    const CSS = `
.dbg-dock{box-sizing:border-box;width:100%;margin:0 auto}
.dbg-inner{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance, 0px) - var(--dsh-composer-side-clearance, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px));max-width:calc(var(--dsh-composer-card-max-width, 748px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px) - var(--dsh-composer-dock-inset, 0px));margin:0 auto}
.dbg-row{display:flex;align-items:center;gap:6px;min-height:28px;padding:0 2px;overflow-x:auto;scrollbar-width:none}
.dbg-row::-webkit-scrollbar{display:none}
.dbg-label{display:inline-flex;align-items:center;gap:5px;flex:none;padding:0 2px;color:var(--dsw-alias-label-tertiary, inherit);font-family:inherit;font-size:11px;line-height:16px;letter-spacing:.02em;white-space:nowrap}
.dbg-label svg{width:13px;height:13px;flex:none}
.dbg-dot{flex:none;width:7px;height:7px;border-radius:50%;corner-shape:round;background:var(--dsw-alias-label-tertiary, currentColor)}
.dbg-dot[data-status="armed"]{background:var(--dsw-alias-state-business-primary, currentColor)}
.dbg-dot[data-status="paused"]{background:var(--dsw-alias-state-error-primary, currentColor);animation:dbg-pulse 1.1s ease-in-out infinite}
@keyframes dbg-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){.dbg-dot[data-status="paused"]{animation:none}}
.dbg-status{flex:none;color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:12px;line-height:18px;white-space:nowrap}
.dbg-sep{flex:none;color:var(--dsw-alias-label-tertiary, inherit);font-family:inherit;font-size:11px;line-height:16px}
.dbg-btn[aria-pressed="true"]{border-color:transparent;background:var(--dsw-alias-state-business-primary, #2f6fed);color:#fff}
.dbg-meta{min-width:0;max-width:260px;overflow:hidden;color:var(--dsw-alias-label-tertiary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px;white-space:nowrap;text-overflow:ellipsis}
.dbg-actions{display:flex;align-items:center;gap:6px;flex:none;margin-left:auto}
.dbg-btn{appearance:none;flex:none;padding:3px 9px;border:0.5px solid var(--dsw-alias-border-l3, transparent);border-radius:999px;corner-shape:round;background:transparent;color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:12px;line-height:18px;cursor:pointer}
.dbg-btn:disabled{cursor:default;opacity:.45}
.dbg-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary, currentColor);outline-offset:2px}
.dbg-btn[data-tone="solid"]{border-color:transparent;background:var(--dsw-alias-state-business-primary, #2f6fed);color:#fff}
.dbg-btn[data-tone="solid"]:hover:not(:disabled){opacity:.9}
.dbg-btn[data-tone="danger"]{border-color:var(--dsw-alias-state-error-primary, transparent);color:var(--dsw-alias-state-error-primary, inherit)}
.dbg-notice{padding:2px 4px 0;color:var(--dsw-alias-state-error-primary, inherit);font-family:inherit;font-size:11px;line-height:16px}
.dbg-panel{display:grid;gap:6px;margin-top:8px;padding:10px 12px;border:0.5px solid var(--dsw-alias-border-l1, transparent);border-radius:var(--dsw-radius-md, 12px);background:var(--dsw-alias-bg-layer-2, transparent)}
.dbg-kv{display:flex;gap:8px;align-items:baseline;min-width:0;font-family:inherit;font-size:11px;line-height:16px}
.dbg-kv>span:first-child{flex:none;color:var(--dsw-alias-label-tertiary, inherit)}
.dbg-kv>span:last-child{min-width:0;overflow:hidden;color:var(--dsw-alias-label-secondary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;text-overflow:ellipsis}
.dbg-section{margin-top:2px;color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:11px;line-height:16px}
.dbg-list{display:grid;gap:3px;margin:0;padding:0;list-style:none}
.dbg-item{display:flex;gap:6px;min-width:0;color:var(--dsw-alias-label-secondary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px}
.dbg-item>span:first-child{flex:none;color:var(--dsw-alias-label-tertiary, inherit)}
.dbg-item>span:last-child{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.dbg-hint{color:var(--dsw-alias-label-tertiary, inherit);font-family:inherit;font-size:11px;line-height:16px}
.dbg-side{box-sizing:border-box;height:100%;overflow:auto;padding:14px 16px}
.dbg-side-inner{display:flex;flex-direction:column;gap:10px;width:100%;max-width:720px;margin:0 auto}
.dbg-side-head{display:flex;align-items:flex-start;gap:8px;min-width:0}
.dbg-side-title{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary, inherit);font-family:inherit;font-size:15px;line-height:22px;font-weight:600}
.dbg-side-title svg{width:15px;height:15px;flex:none;color:var(--dsw-alias-state-business-primary, currentColor)}
.dbg-side-sub{margin-top:2px;color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:11px;line-height:16px}
.dbg-timer{flex:none;margin-left:auto;padding:2px 7px;border-radius:999px;background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-label-secondary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:15px;white-space:nowrap}
.dbg-block{display:grid;gap:6px}
.dbg-kicker{color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:10px;line-height:15px;letter-spacing:.04em}
.dbg-quote{padding:9px 10px;border-radius:8px;background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-label-primary, inherit);font-family:inherit;font-size:13px;line-height:19px;white-space:pre-wrap;word-break:break-word}
.dbg-tool{display:inline-flex;align-items:center;align-self:flex-start;padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-state-business-primary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:17px}
.dbg-args{max-height:150px;margin:0;overflow:auto;padding:8px;border-radius:8px;background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-label-secondary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px;white-space:pre-wrap;word-break:break-word}
.dbg-editor{box-sizing:border-box;width:100%;min-height:96px;resize:vertical;padding:8px;border:0.5px solid var(--dsw-alias-border-l2, transparent);border-radius:8px;background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-label-primary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px}
.dbg-editor:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary, currentColor);outline-offset:1px}
.dbg-dialog-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.dbg-dialog-actions .dbg-btn{padding:5px 11px;font-size:11px;line-height:16px}
.dbg-dialog-actions .dbg-btn[data-tone="solid"]{font-weight:600}
.dbg-more summary{cursor:pointer;color:var(--dsw-alias-label-tertiary, inherit);font-family:inherit;font-size:11px;line-height:16px}
.dbg-sect{margin-top:4px;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-base, transparent)}
.dbg-sect>summary{display:flex;align-items:center;gap:2px;cursor:pointer;list-style:none}
.dbg-sect>summary::-webkit-details-marker{display:none}
.dbg-sect>summary::before{content:'▸';display:inline-block;width:12px;color:var(--dsw-alias-label-tertiary, inherit)}
.dbg-sect[open]>summary::before{content:'▾'}
.dbg-sect-name{display:flex;flex:1;min-width:0;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-secondary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:15px}
.dbg-sect-name>span:last-child{flex:none;color:var(--dsw-alias-label-tertiary, inherit)}
.dbg-pre{max-height:150px;margin:4px 0 0;overflow:auto;padding:7px;border-radius:8px;background:var(--dsw-alias-bg-layer-2, transparent);color:var(--dsw-alias-label-secondary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:15px;white-space:pre-wrap;word-break:break-word}
.dbg-msg{display:grid;gap:2px;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-base, transparent)}
.dbg-msg-head{display:flex;gap:6px;color:var(--dsw-alias-label-tertiary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:14px}
.dbg-msg-body{color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:11px;line-height:16px;white-space:pre-wrap;word-break:break-word}
@media (hover:hover){
.dbg-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover, transparent);color:var(--dsw-alias-label-primary, inherit)}
}
.ad-panel{box-sizing:border-box;height:100%;overflow:auto;padding:16px 18px}
.ad-inner{display:flex;flex-direction:column;gap:12px;width:100%;max-width:720px;margin:0 auto}
.ad-head{display:flex;align-items:flex-start;gap:10px;min-width:0}
.ad-title{display:flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary, inherit);font-family:inherit;font-size:16px;line-height:22px;font-weight:600}
.ad-title svg{width:15px;height:15px;flex:none;color:var(--dsw-alias-state-business-primary, currentColor)}
.ad-sub{margin-top:2px;color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:11px;line-height:16px}
.ad-timer{flex:none;margin-left:auto;padding:2px 7px;border-radius:999px;background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-label-secondary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:15px;white-space:nowrap}
.ad-kicker{color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:10px;line-height:15px;letter-spacing:.04em}
.ad-block{display:flex;flex-direction:column;gap:6px}
.ad-quote{max-height:180px;overflow:auto;padding:9px 10px;border-radius:8px;background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-label-primary, inherit);font-family:inherit;font-size:13px;line-height:19px;white-space:pre-wrap;word-break:break-word}
.ad-tool{display:inline-flex;align-items:center;align-self:flex-start;padding:2px 8px;border-radius:999px;background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-state-business-primary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:17px}
.ad-args{max-height:96px;margin:0;overflow:auto;padding:8px;border-radius:8px;background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-label-secondary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px;white-space:pre-wrap;word-break:break-word}
.ad-file{color:var(--dsw-alias-label-secondary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px;word-break:break-all}
.ad-diff{display:flex;flex-direction:column;max-height:180px;margin:0;overflow:auto;padding:6px 8px;border-radius:8px;background:var(--dsw-alias-bg-base, transparent);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px}
.ad-diff-line{display:flex;gap:6px;min-height:16px;white-space:pre-wrap;word-break:break-word}
.ad-diff-sign{flex:none;width:10px;color:var(--dsw-alias-label-tertiary, inherit)}
.ad-diff-add .ad-diff-sign{color:var(--dsw-alias-state-business-primary, inherit)}
.ad-diff-del .ad-diff-sign{color:var(--dsw-alias-state-error-primary, inherit)}
.ad-diff-meta{color:var(--dsw-alias-label-tertiary, inherit);font-style:italic}
.ad-actions{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}
.ad-btn{appearance:none;flex:none;padding:5px 11px;border:0.5px solid var(--dsw-alias-border-l3, transparent);border-radius:999px;corner-shape:round;background:transparent;color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:11px;line-height:16px;cursor:pointer}
.ad-btn:disabled{cursor:default;opacity:.45}
.ad-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary, currentColor);outline-offset:2px}
.ad-btn[data-tone="solid"]{border-color:transparent;background:var(--dsw-alias-state-business-primary, #2f6fed);color:#fff;font-weight:600}
.ad-btn[data-tone="solid"]:hover:not(:disabled){opacity:.9}
.ad-btn[data-tone="danger"]{border-color:var(--dsw-alias-state-error-primary, transparent);color:var(--dsw-alias-state-error-primary, inherit)}
.ad-editor{box-sizing:border-box;width:100%;min-height:96px;resize:vertical;padding:8px;border:0.5px solid var(--dsw-alias-border-l2, transparent);border-radius:8px;background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-label-primary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px}
.ad-tabs{display:flex;flex-wrap:wrap;gap:2px;padding-bottom:3px;border-bottom:0.5px solid var(--dsw-alias-border-l1, transparent)}
.ad-tab{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:0;appearance:none;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-tertiary, inherit);font-family:inherit;padding:4px 8px 5px;cursor:pointer}
.ad-tab-caption{color:var(--dsw-alias-label-tertiary, inherit);font-family:inherit;font-size:9px;line-height:11px;letter-spacing:.06em;text-transform:uppercase}
.ad-tab-label{color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:11px;line-height:16px}
.ad-tab[aria-selected="true"]{background:var(--dsw-alias-bg-base, transparent)}
.ad-tab[aria-selected="true"] .ad-tab-label{color:var(--dsw-alias-label-primary, inherit);font-weight:600}
.ad-tab[aria-selected="true"]::after{content:'';position:absolute;left:8px;right:8px;bottom:0;height:2px;border-radius:2px;background:var(--dsw-alias-state-business-primary, currentColor)}
.ad-tab:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary, currentColor);outline-offset:1px}
.ad-content{display:flex;flex-direction:column;gap:6px}
.ad-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.ad-search{box-sizing:border-box;flex:1;min-width:120px;padding:5px 8px;border:0.5px solid var(--dsw-alias-border-l2, transparent);border-radius:6px;background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-label-primary, inherit);font-family:inherit;font-size:11px;line-height:16px}
.ad-search:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary, currentColor);outline-offset:1px}
.ad-chips{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.ad-chip-label{color:var(--dsw-alias-label-tertiary, inherit);font-family:inherit;font-size:10px;line-height:15px;margin-right:2px}
.ad-chip{appearance:none;padding:2px 7px;border:0.5px solid var(--dsw-alias-border-l1, transparent);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:10px;line-height:15px;cursor:pointer}
.ad-chip[data-active="true"]{border-color:var(--dsw-alias-border-l3, transparent);background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-label-primary, inherit)}
.ad-summary-line{color:var(--dsw-alias-label-secondary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:15px}
.ad-row{border:0.5px solid var(--dsw-alias-border-l1, transparent);border-radius:8px;background:var(--dsw-alias-bg-layer-2, transparent)}
.ad-row>summary{display:flex;align-items:center;gap:4px;justify-content:space-between;padding:7px 9px;cursor:pointer;list-style:none;color:var(--dsw-alias-label-secondary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:16px;word-break:break-word}
.ad-row>summary::-webkit-details-marker{display:none}
.ad-row>summary::before{content:'▸';flex:none;width:10px;color:var(--dsw-alias-label-tertiary, inherit)}
.ad-row[open]>summary::before{content:'▾'}
.ad-row-body{display:flex;flex-direction:column;gap:5px;padding:0 9px 8px}
.ad-pre{max-height:180px;margin:4px 0;overflow:auto;padding:8px;border-radius:6px;background:var(--dsw-alias-bg-base, transparent);color:var(--dsw-alias-label-secondary, inherit);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;line-height:15px;white-space:pre-wrap;word-break:break-word}
.ad-error{color:var(--dsw-alias-state-error-primary, inherit)}
.ad-note{color:var(--dsw-alias-label-tertiary, inherit);font-family:inherit;font-size:10px;line-height:15px}
.ad-text{color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:11px;line-height:17px;word-break:break-word}
.ad-list{margin:0;padding-left:16px;color:var(--dsw-alias-label-secondary, inherit);font-family:inherit;font-size:11px;line-height:17px}
.ad-card{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:8px;background:var(--dsw-alias-bg-base, transparent)}
@media (max-width: 560px){.ad-panel{padding:12px}.ad-title{font-size:15px}}

`

    /**
     * Resolve a Host route against the page base.
     * @param {string} path - route below the page base.
     * @returns {URL} absolute same-origin URL.
     */
    function routeUrl(path) {
      const base = typeof document !== 'undefined' && typeof document.baseURI === 'string' && document.baseURI.length > 0
        ? document.baseURI
        : 'http://dsh.internal/'
      const url = new URL(base)
      url.search = ''
      url.hash = ''
      if (!url.pathname.endsWith('/')) url.pathname += '/'
      return new URL(String(path).replace(/^\/+/, ''), url)
    }

    /**
     * Call one debugger API method.
     * @param {'GET'|'POST'} method - HTTP method.
     * @param {string} action - route below `/agent-debugger/api/`.
     * @param {Record<string, unknown>} [payload] - JSON body.
     * @returns {Promise<any>} decoded body.
     */
    async function request(method, action, payload) {
      const init = { method, credentials: 'same-origin', headers: { accept: 'application/json' } }
      if (payload !== undefined) {
        init.headers['content-type'] = 'application/json'
        init.body = JSON.stringify(payload)
      }
      const response = await fetch(routeUrl(`agent-debugger/api/${action}`), init)
      let data = null
      try {
        data = await response.json()
      } catch {
        // Proxies and auth responses may not be JSON.
      }
      if (!response.ok || data === null || data.ok !== true) {
        const message = data?.error?.message
        throw new Error(typeof message === 'string' && message.length > 0 ? message : `HTTP ${response.status}`)
      }
      return data
    }

    /**
     * @param {unknown} error - thrown value.
     * @returns {string} display message.
     */
    function messageOf(error) {
      return error instanceof Error && error.message.length > 0 ? error.message : String(error)
    }

    /**
     * @param {unknown} value - JSON value.
     * @returns {string} pretty JSON or a string fallback.
     */
    function pretty(value) {
      try {
        return JSON.stringify(value, null, 2)
      } catch {
        return String(value)
      }
    }

    /**
     * Remove injected runtime-context blocks from a user message preview.
     * @param {unknown} value - preview text.
     * @returns {string} human text, possibly empty.
     */
    function stripReminder(value) {
      return String(value ?? '')
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
        .trim()
    }

    /**
     * @param {unknown} value - optional value.
     * @returns {string} display value.
     */
    function dash(value) {
      return value === null || value === undefined ? '—' : pretty(value)
    }

    /**
     * Human summary for an armed mode.
     * @param {any} state - debugger state.
     * @param {(key: string) => string} t - translator.
     * @returns {string} summary.
     */
    function armedDescription(state, t) {
      if (state?.mode === 'step') return state.turnEnded ? t('turnEnded') : t('armedForStep')
      if (state?.mode === 'finish') return t('armedForFinish')
      return t('armedForTool')
    }

    /**
     * Status line for an armed mode.
     * @param {any} state - debugger state.
     * @param {(key: string) => string} t - translator.
     * @returns {string} status.
     */
    function armedStatus(state, t) {
      if (state?.mode === 'step') return t('stepModeOn')
      if (state?.mode === 'finish') return t('finishModeOn')
      return `${t('toolModeOn')} ${(state?.tools ?? []).join(', ') || '—'}`
    }

    /**
     * @param {any} item - breakpoint history entry.
     * @returns {string} compact history label.
     */
    function historyLabel(item) {
      return `${item.kind}${item.tool ? `:${item.tool}` : ''} · ${item.action}`
    }

    /**
     * @param {any} history - breakpoint history.
     * @param {number} [limit] - tail size.
     * @returns {any[]} newest-first recent entries.
     */
    function recentHistory(history, limit = 6) {
      return (Array.isArray(history) ? history : []).slice(-limit).reverse()
    }

    /**
     * Short meta line for a pending breakpoint.
     * @param {any} pending - pending breakpoint.
     * @param {(key: string) => string} t - translator.
     * @param {number} remaining - seconds until auto-release.
     * @returns {string} meta line.
     */
    function pendingMeta(pending, t, remaining) {
      if (pending.kind === 'tool') return `${t('toolCall')}: ${pending.tool} · ${t('auto')} ${remaining}s`
      if (pending.kind === 'finish') return `${t('finishMode')} · ${t('autoFinish')} ${remaining}s`
      return `${t('stepNumber')} ${pending.step ?? '—'} · ${t('auto')} ${remaining}s`
    }

    /** Small breakpoint mark. */
    function DebugIcon() {
      return h('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true', focusable: 'false' },
        h('circle', { cx: '10', cy: '10', r: '6', fill: 'none', stroke: 'currentColor', strokeWidth: '1.6' }),
        h('circle', { cx: '10', cy: '10', r: '2.2', fill: 'currentColor' }),
      )
    }

    /**
     * Shared polling/action state for the dock and the sidebar panel.
     * @param {string} sessionId - session identity.
     * @param {(key: string) => string} t - translator.
     * @returns {any} state and actions.
     */
    function useDebugger(sessionId, t) {
      const [state, setState] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const alive = React.useRef(true)
      const tRef = React.useRef(t)
      tRef.current = t
      const pending = state?.pending ?? null
      const fast = state?.armed === true || pending !== null

      const refresh = React.useCallback(async () => {
        try {
          const data = await request('GET', `state?sessionId=${encodeURIComponent(sessionId)}`)
          if (!alive.current) return
          setState(data.state)
          setLoading(false)
          setError(null)
        } catch (failure) {
          if (!alive.current) return
          setLoading(false)
          setError(`${tRef.current('pollFailed')}: ${messageOf(failure)}`)
        }
      }, [sessionId])

      React.useEffect(() => {
        alive.current = true
        void refresh()
        const timer = setInterval(() => { if (!document.hidden) void refresh() }, fast ? 900 : 4000)
        return () => {
          alive.current = false
          clearInterval(timer)
        }
      }, [refresh, fast])

      /**
       * Run one API action.
       * @param {() => Promise<any>} action - API call.
       * @returns {Promise<any>} result.
       */
      const run = async (action) => {
        if (busy) return undefined
        setBusy(true)
        setError(null)
        try {
          const data = await action()
          if (data?.state) setState(data.state)
          await refresh()
          return data
        } catch (failure) {
          setError(messageOf(failure))
          return undefined
        } finally {
          setBusy(false)
        }
      }

      return {
        state,
        loading,
        busy,
        error,
        setError,
        refresh,
        run,
        pending,
        arm: (mode, once = true) => run(() => request('POST', 'arm', { sessionId, mode, once })),
        disarm: () => run(() => request('POST', 'disarm', { sessionId })),
        resolve: (action, extra) => run(() => request('POST', 'resolve', { sessionId, id: pending?.id, action, ...extra })),
      }
    }

    /**
     * Open the sidebar tab once per pending breakpoint, retrying briefly while
     * the sidebar service is still loading.
     * @param {any} pending - current pending breakpoint.
     * @returns {boolean | null} whether the sidebar accepted the open request.
     */
    function useAutoOpenPanel(pending) {
      const opened = React.useRef(null)
      const [sidebarReady, setSidebarReady] = React.useState(null)
      React.useEffect(() => {
        if (pending === null) {
          opened.current = null
          return undefined
        }
        if (opened.current === pending.id) return undefined
        opened.current = pending.id
        let cancelled = false
        let retry
        let attempts = 0
        const tryOpen = () => {
          const ok = openSidebarTab()
          if (cancelled) return
          setSidebarReady(ok)
          if (!ok && attempts < 3) {
            attempts += 1
            retry = setTimeout(tryOpen, 1200)
          }
        }
        tryOpen()
        return () => {
          cancelled = true
          if (retry !== undefined) clearTimeout(retry)
        }
      }, [pending?.id])
      return sidebarReady
    }

    /**
     * Pending-breakpoint body, shared by the sidebar panel.
     * @param {{ debugger: any, t: (key: string) => string }} props - debugger state and translator.
     * @returns {import('react').ReactElement} body.
     */
    /**
     * Segmented tabs for the inspector.
     * @param {{ value: string, onChange: (value: string) => void, tabs: Array<{ id: string, label: string }> }} props - tabs.
     * @returns {import('react').ReactElement} tab strip.
     */
    function Tabs({ value, onChange, tabs }) {
      return h('div', { className: 'ad-tabs', role: 'tablist' },
        tabs.map((tab) => h('button', {
          key: tab.id,
          type: 'button',
          role: 'tab',
          className: 'ad-tab',
          'aria-selected': value === tab.id,
          onClick: () => onChange(tab.id),
        },
        h('span', { className: 'ad-tab-caption' }, tab.caption),
        h('span', { className: 'ad-tab-label' }, tab.label),
        )),
      )
    }

    /**
     * @param {unknown} args - tool arguments.
     * @returns {string | null} file path argument.
     */
    function pathOf(args) {
      if (args === null || typeof args !== 'object') return null
      const path = args.file_path ?? args.path
      return typeof path === 'string' && path.length > 0 ? path : null
    }

    /**
     * @param {string} value - text.
     * @returns {string[]} lines; empty text has no lines.
     */
    function splitLines(value) {
      return value.length === 0 ? [] : value.split('\n')
    }

    /**
     * Bounded common-prefix/suffix line diff. An edit argument is one local
     * replacement, so this is exact enough and avoids a diff dependency.
     * @param {string} before - old text.
     * @param {string} after - new text.
     * @returns {{ lines: Array<{ type: 'ctx'|'add'|'del'|'meta', text: string }>, additions: number, deletions: number, truncated: boolean }} diff.
     */
    function diffLines(before, after) {
      const oldLines = splitLines(String(before ?? ''))
      const newLines = splitLines(String(after ?? ''))
      let prefix = 0
      while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1
      let suffix = 0
      while (suffix < oldLines.length - prefix && suffix < newLines.length - prefix
        && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix += 1
      const context = 2
      const limit = 40
      const lines = []
      let truncated = false
      const push = (type, text) => { lines.push({ type, text }) }
      const pushBlock = (type, block) => {
        if (block.length <= limit) {
          for (const line of block) push(type, line)
          return
        }
        const half = Math.floor(limit / 2)
        for (const line of block.slice(0, half)) push(type, line)
        push('meta', `… ${block.length - limit} more ${type === 'add' ? 'added' : 'deleted'} line(s)`)
        for (const line of block.slice(-half)) push(type, line)
        truncated = true
      }
      for (const line of oldLines.slice(Math.max(0, prefix - context), prefix)) push('ctx', line)
      const deleted = oldLines.slice(prefix, oldLines.length - suffix)
      const added = newLines.slice(prefix, newLines.length - suffix)
      pushBlock('del', deleted)
      pushBlock('add', added)
      const tailStart = oldLines.length - suffix
      for (const line of oldLines.slice(tailStart, Math.min(oldLines.length, tailStart + context))) push('ctx', line)
      return { lines, additions: added.length, deletions: deleted.length, truncated }
    }

    /**
     * Human-readable preview for the frozen tool arguments. Rendering only:
     * it never reads the filesystem or changes the call.
     * @param {unknown} tool - tool name.
     * @param {unknown} args - frozen arguments.
     * @returns {{ kind: string, [key: string]: any }} preview.
     */
    function toolPreview(tool, args) {
      const name = typeof tool === 'string' ? tool : ''
      const path = pathOf(args)
      if (name === 'edit' && args !== null && typeof args === 'object') {
        const oldText = typeof args.old_string === 'string' ? args.old_string : null
        const newText = typeof args.new_string === 'string' ? args.new_string : null
        if (oldText !== null && newText !== null) {
          const cap = 40000
          const diff = diffLines(oldText.slice(0, cap), newText.slice(0, cap))
          if (oldText.length > cap || newText.length > cap) diff.truncated = true
          return { kind: 'edit', path, replaceAll: args.replace_all === true, diff }
        }
      }
      if (name === 'write' && args !== null && typeof args === 'object' && typeof args.content === 'string') {
        const cap = 6000
        return {
          kind: 'write',
          path,
          lines: splitLines(args.content).length,
          preview: args.content.slice(0, cap),
          truncated: args.content.length > cap,
        }
      }
      if (name === 'apply_patch' && args !== null && typeof args === 'object') {
        const patch = typeof args.patch === 'string'
          ? args.patch
          : typeof args.input === 'string'
            ? args.input
            : typeof args.content === 'string'
              ? args.content
              : null
        if (patch !== null) {
          const cap = 8000
          return { kind: 'patch', text: patch.slice(0, cap), truncated: patch.length > cap }
        }
      }
      if (args !== null && typeof args === 'object' && typeof args.command === 'string') {
        return { kind: 'command', text: args.command }
      }
      return { kind: 'json', text: pretty(args) }
    }

    /**
     * Tool-argument preview used before a tool call runs.
     * @param {{ tool: string, args: unknown, t: (key: string) => string }} props - preview props.
     * @returns {import('react').ReactElement} preview.
     */
    function ToolPreview({ tool, args, t }) {
      const preview = toolPreview(tool, args)
      if (preview.kind === 'command' || preview.kind === 'json') {
        return h('pre', { className: 'ad-args' }, preview.text)
      }
      if (preview.kind === 'patch') {
        return h(React.Fragment, null,
          h('div', { className: 'ad-kicker' }, t('patchLabel')),
          h('pre', { className: 'ad-args' }, preview.text),
          preview.truncated ? h('div', { className: 'ad-note' }, t('contentTruncated')) : null,
        )
      }
      if (preview.kind === 'write') {
        return h(React.Fragment, null,
          preview.path ? h('div', { className: 'ad-file' }, preview.path) : null,
          h('div', { className: 'ad-kicker' }, `${t('contentPreview')} · ${preview.lines} ${t('linesLabel')}`),
          preview.preview.length === 0
            ? h('div', { className: 'ad-note' }, t('emptyFile'))
            : h('pre', { className: 'ad-args' }, preview.preview),
          preview.truncated ? h('div', { className: 'ad-note' }, t('contentTruncated')) : null,
        )
      }
      if (preview.kind === 'edit') {
        const unchanged = preview.diff.additions === 0 && preview.diff.deletions === 0
        return h(React.Fragment, null,
          preview.path ? h('div', { className: 'ad-file' }, preview.path) : null,
          preview.replaceAll ? h('div', { className: 'ad-note' }, t('replaceAll')) : null,
          unchanged
            ? h('div', { className: 'ad-note' }, t('noDiff'))
            : h('div', { className: 'ad-diff' }, preview.diff.lines.map((line, index) => h('div', {
                key: index,
                className: `ad-diff-line ad-diff-${line.type}`,
              },
              h('span', { className: 'ad-diff-sign' }, line.type === 'add' ? '+' : line.type === 'del' ? '-' : line.type === 'meta' ? '…' : ' '),
              line.text.length === 0 ? '\u00a0' : line.text,
              ))),
          preview.diff.truncated ? h('div', { className: 'ad-note' }, t('diffTruncated')) : null,
        )
      }
      return null
    }

    /**
     * One collapsible inspector row.
     * @param {{ summary: any, open?: boolean, children?: any }} props - row props.
     * @returns {import('react').ReactElement} row.
     */
    function InspectorRow({ summary, open, children }) {
      return h('details', { className: 'ad-row', open: open ? true : undefined },
        h('summary', null, summary),
        h('div', { className: 'ad-row-body' }, children),
      )
    }

    /**
     * Request inspector tab.
     * @param {{ inspect: any, inspectError: string | null, t: (key: string) => string, kind: string }} props - inspector data and pause kind.
     * @returns {import('react').ReactElement} tab body.
     */
    function RequestTab({ inspect, inspectError, t, kind }) {
      const [expandAll, setExpandAll] = React.useState(false)
      const [query, setQuery] = React.useState('')
      const [role, setRole] = React.useState('all')
      const [copyState, setCopyState] = React.useState('idle')
      if (!inspect) return h('div', { className: inspectError ? 'ad-note ad-error' : 'ad-note' }, inspectError ? `${t('inspectFailed')}: ${inspectError}` : t('loadingInspect'))
      const request = inspect.request ?? {}
      const tools = Array.isArray(request.tools) ? request.tools : []
      const sections = Array.isArray(request.sections) ? request.sections : []
      const contexts = Array.isArray(request.contexts) ? request.contexts : []
      const messages = Array.isArray(request.messages) ? request.messages : []
      const nonEmptySections = sections.filter((section) => (Number(section?.chars) || 0) > 0)
      const hiddenSections = sections.length - nonEmptySections.length
      const q = query.trim().toLowerCase()
      const filtering = q.length > 0
      const has = (value) => !filtering || String(value ?? '').toLowerCase().includes(q)

      const roleMatches = (message, value) => {
        if (value === 'all') return true
        if (value === 'user') return message.role === 'user' && message.source === 'user'
        if (value === 'assistant') return message.role === 'assistant'
        if (value === 'tool') return message.role === 'tool'
        if (value === 'context') return message.role === 'user' && message.source !== 'user'
        return true
      }

      const filteredTools = tools.filter((tool) => has(tool.name) || has(tool.description) || has(pretty(tool.parameters)))
      const filteredSections = nonEmptySections.filter((section) => has(section.name) || has(section.text))
      const filteredContexts = contexts.filter((context) => has(context.name) || has(context.text))
      const baseMessages = messages.filter((message) => has(message.role) || has(message.source) || has(message.toolName) || has(message.preview))
      const counts = {
        all: baseMessages.length,
        user: baseMessages.filter((message) => roleMatches(message, 'user')).length,
        assistant: baseMessages.filter((message) => roleMatches(message, 'assistant')).length,
        tool: baseMessages.filter((message) => roleMatches(message, 'tool')).length,
        context: baseMessages.filter((message) => roleMatches(message, 'context')).length,
      }
      const filteredMessages = baseMessages.filter((message) => roleMatches(message, role))
      const autoOpen = expandAll || filtering
      const autoOpenMessages = autoOpen || role !== 'all'
      const nothing = filtering && filteredTools.length + filteredSections.length + filteredContexts.length + filteredMessages.length === 0

      const copyRequest = async () => {
        const dump = {
          model: request.config ?? null,
          adapterDefaults: request.adapterDefaults ?? null,
          tools,
          sections,
          contexts,
          messages,
          truncated: request.truncated ?? null,
        }
        try {
          await navigator.clipboard.writeText(JSON.stringify(dump, null, 2))
          setCopyState('copied')
          setTimeout(() => setCopyState('idle'), 1500)
        } catch {
          setCopyState('failed')
        }
      }

      return h('div', { className: 'ad-content' },
        h('div', { className: 'ad-summary-line' }, `${request.config?.model ?? '—'} · ${tools.length} ${t('requestTools')} · ${sections.length} ${t('requestSections')} (${nonEmptySections.length} ${t('nonEmpty')}) · ${messages.length} ${t('requestMessages')}`),
        h('div', { className: 'ad-note' }, kind === 'finish' ? t('requestFinishNote') : kind === 'tool' ? t('requestSentNote') : t('requestPreviewNote')),
        h('div', { className: 'ad-toolbar' },
          h('input', {
            className: 'ad-search',
            type: 'search',
            spellCheck: false,
            placeholder: t('filterPlaceholder'),
            value: query,
            onChange: (event) => setQuery(event.target.value),
          }),
          filtering ? h('button', { type: 'button', className: 'ad-btn', onClick: () => setQuery('') }, t('clear')) : null,
          h('button', { type: 'button', className: 'ad-btn', onClick: () => void copyRequest() }, copyState === 'copied' ? t('copied') : copyState === 'failed' ? t('copyFailed') : t('copyRequest')),
          h('button', { type: 'button', className: 'ad-btn', onClick: () => setExpandAll((value) => !value) }, expandAll ? t('collapseAll') : t('expandAll')),
        ),
        h('div', { className: 'ad-chips' },
          h('span', { className: 'ad-chip-label' }, t('messagesFilter')),
          [['all', t('msgAll')], ['user', t('msgUser')], ['assistant', t('msgModel')], ['tool', t('msgTool')], ['context', t('msgContext')]].map(([id, label]) => h('button', {
            key: id,
            type: 'button',
            className: 'ad-chip',
            'data-active': role === id,
            onClick: () => setRole(id),
          }, `${label} ${counts[id]}`)),
        ),
        nothing ? h('div', { className: 'ad-note' }, t('noMatch')) : null,
        h(InspectorRow, { key: `model-${expandAll}`, open: expandAll, summary: t('modelParams') },
          h('pre', { className: 'ad-pre' }, pretty({ config: request.config ?? null, adapterDefaults: request.adapterDefaults ?? null })),
          request.config === null ? h('div', { className: 'ad-note' }, t('noHeader')) : null,
        ),
        filtering && filteredTools.length === 0 ? null : h(InspectorRow, {
          key: `tools-${autoOpen}`,
          open: autoOpen,
          summary: `${t('requestTools')} · ${filteredTools.length}${filtering ? ` / ${tools.length}` : ''}`,
        },
          filteredTools.map((tool, index) => h(InspectorRow, {
            key: `t-${filtering}-${index}`,
            open: filtering,
            summary: tool.name,
          },
            h('pre', { className: 'ad-pre' }, `${tool.description ?? ''}\n\n${pretty(tool.parameters)}`),
          )),
          h('div', { className: 'ad-note' }, t('toolsOwner')),
        ),
        filtering && filteredSections.length === 0 ? null : h(InspectorRow, {
          key: `sections-${autoOpen}`,
          open: autoOpen,
          summary: `${t('requestSections')} · ${filteredSections.length}${filtering ? ` / ${nonEmptySections.length}` : ''}`,
        },
          filteredSections.map((section, index) => h(InspectorRow, {
            key: `s-${autoOpen}-${index}`,
            open: autoOpen,
            summary: `${section.name} · ${section.chars}`,
          },
            h('pre', { className: 'ad-pre' }, section.text || t('noPreview')),
          )),
          hiddenSections > 0 ? h('div', { className: 'ad-note' }, `${hiddenSections} ${t('hiddenEmpty')}`) : null,
          request.truncated ? h('div', { className: 'ad-note' }, t('truncated')) : null,
        ),
        filtering && filteredContexts.length === 0 ? null : h(InspectorRow, {
          key: `contexts-${autoOpen}`,
          open: autoOpen,
          summary: `${t('requestContexts')} · ${filteredContexts.length}${filtering ? ` / ${contexts.length}` : ''}`,
        },
          filteredContexts.map((context, index) => h(InspectorRow, {
            key: `c-${autoOpen}-${index}`,
            open: autoOpen,
            summary: `${context.name} · ${context.chars}`,
          },
            h('pre', { className: 'ad-pre' }, context.text || t('noPreview')),
          )),
        ),
        (filtering || role !== 'all') && filteredMessages.length === 0 ? null : h(InspectorRow, {
          key: `messages-${autoOpenMessages}-${role}`,
          open: autoOpenMessages,
          summary: `${t('requestMessages')} · ${filteredMessages.length}${filtering || role !== 'all' ? ` / ${messages.length}` : ''}`,
        },
          filteredMessages.length === 0
            ? h('div', { className: 'ad-note' }, t('noMessagesInspect'))
            : filteredMessages.map((message, index) => h(InspectorRow, {
                key: `m-${autoOpenMessages}-${role}-${index}`,
                open: autoOpenMessages,
                summary: `${message.role}${message.source ? ` · ${message.source}` : ''}${message.toolName ? ` · ${message.toolName}` : message.toolCallId ? ` · ${String(message.toolCallId).slice(0, 8)}` : ''} · ${message.chars}`,
              },
                h('pre', { className: 'ad-pre' }, message.preview || t('noPreview')),
              )),
        ),
      )
    }

    /**
     * Provenance summary tab.
     * @param {{ inspect: any, t: (key: string) => string }} props - inspector data.
     * @returns {import('react').ReactElement} tab body.
     */
    function SourcesTab({ inspect, t }) {
      if (!inspect) return h('div', { className: 'ad-note' }, t('loadingInspect'))
      const request = inspect.request ?? {}
      const tools = Array.isArray(request.tools) ? request.tools : []
      const sections = Array.isArray(request.sections) ? request.sections : []
      const nonEmptySections = sections.filter((section) => (Number(section?.chars) || 0) > 0)
      const hiddenSections = sections.length - nonEmptySections.length
      const messages = Array.isArray(request.messages) ? request.messages : []
      const counts = new Map()
      for (const message of messages) {
        const key = message.source ?? message.role ?? '?'
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      return h('div', { className: 'ad-content' },
        h('div', { className: 'ad-note' }, t('sourcesNote')),
        h('div', { className: 'ad-card' },
          h('div', { className: 'ad-kicker' }, `${t('requestSections')} · ${nonEmptySections.length}`),
          h('div', { className: 'ad-text' }, nonEmptySections.map((section) => section.name).join(' · ') || '—'),
          hiddenSections > 0 ? h('div', { className: 'ad-note' }, `${hiddenSections} ${t('hiddenEmpty')}`) : null,
        ),
        h('div', { className: 'ad-card' },
          h('div', { className: 'ad-kicker' }, `${t('requestTools')} · ${tools.length}`),
          h('div', { className: 'ad-text' }, tools.map((tool) => tool.name).join(' · ') || '—'),
          h('div', { className: 'ad-note' }, t('toolsOwner')),
        ),
        h('div', { className: 'ad-card' },
          h('div', { className: 'ad-kicker' }, `${t('requestMessages')} · ${messages.length}`),
          h('div', { className: 'ad-text' }, [...counts.entries()].map(([source, count]) => `${source}: ${count}`).join(' · ') || '—'),
        ),
      )
    }

    /**
     * Previous response/result tab.
     * @param {{ inspect: any, t: (key: string) => string }} props - inspector data.
     * @returns {import('react').ReactElement} tab body.
     */
    function ResultTab({ inspect, t, kind }) {
      if (!inspect) return h('div', { className: 'ad-note' }, t('loadingInspect'))
      const assistant = inspect.result?.assistant ?? null
      const tool = inspect.result?.tool ?? null
      return h('div', { className: 'ad-content' },
        h('div', { className: 'ad-note' }, kind === 'finish' ? t('resultNoteFinish') : kind === 'tool' ? t('resultNoteTool') : t('resultNoteStep')),
        h('div', { className: 'ad-kicker' }, t('lastAssistant')),
        assistant
          ? h('div', { className: 'ad-card' },
              assistant.text ? h('pre', { className: 'ad-pre' }, assistant.text) : h('div', { className: 'ad-note' }, t('noPreview')),
              (assistant.toolCalls ?? []).length > 0
                ? h('div', { className: 'ad-note' }, `${t('toolCalls')}: ${(assistant.toolCalls ?? []).map((call) => call.name ?? '?').join(', ')}`)
                : null,
              h('div', { className: 'ad-note' }, `${t('finish')}: ${dash(assistant.finish)} · ${t('usage')}: ${dash(assistant.usage)}`),
            )
          : h('div', { className: 'ad-note' }, t('noResult')),
        h('div', { className: 'ad-kicker' }, t('lastTool')),
        tool
          ? h('div', { className: 'ad-card' },
              h('div', { className: 'ad-tool' }, tool.name ?? 'tool'),
              h('div', { className: 'ad-note' }, tool.isError ? t('error') : t('ok')),
              tool.arguments ? h('pre', { className: 'ad-pre' }, pretty(tool.arguments)) : null,
              tool.output ? h('pre', { className: 'ad-pre' }, tool.output) : null,
            )
          : h('div', { className: 'ad-note' }, t('noTool')),
      )
    }

    /**
     * Pause header: title, kind-specific subtitle, and timeout.
     * @param {{ pending: any, isTool: boolean, isFinish: boolean, remaining: number, t: (key: string) => string }} props - pause facts.
     * @returns {import('react').ReactElement} header.
     */
    function PauseHeader({ pending, isTool, isFinish, remaining, t }) {
      const sub = isTool
        ? t('pausedToolSub')
        : isFinish
          ? t('pausedFinishSub')
          : `${t('pausedStepSub')} · ${t('stepNumber')} ${pending.step ?? '—'}`
      return h('div', { className: 'ad-head' },
        h('div', null,
          h('div', { className: 'ad-title' }, h(DebugIcon), t('pausedTitle')),
          h('div', { className: 'ad-sub' }, sub),
        ),
        h('div', { className: 'ad-timer' }, `${isFinish ? t('autoFinish') : t('autoRelease')} ${remaining}s`),
      )
    }

    /**
     * Pause body: pending tool call, final answer, or claimed user message.
     * @param {{ pending: any, isTool: boolean, isFinish: boolean, finalAssistant: any, lastUser: any, panel: string|null, t: (key: string) => string }} props - pause facts.
     * @returns {import('react').ReactElement} body.
     */
    function PauseBody({ pending, isTool, isFinish, finalAssistant, lastUser, panel, t }) {
      if (isTool) {
        return h('div', { className: 'ad-block' },
          h('div', { className: 'ad-kicker' }, t('toolCall')),
          h('div', { className: 'ad-tool' }, pending.tool),
          panel === 'edit' ? null : h(ToolPreview, { tool: pending.tool, args: pending.arguments, t }),
        )
      }
      if (isFinish) {
        return h('div', { className: 'ad-block' },
          h('div', { className: 'ad-kicker' }, t('finalAnswer')),
          finalAssistant?.text
            ? h('div', { className: 'ad-quote' }, finalAssistant.text)
            : h('div', { className: 'ad-note' }, t('noResult')),
          h('div', { className: 'ad-note' }, t('finishHint')),
        )
      }
      return h('div', { className: 'ad-block' },
        h('div', { className: 'ad-kicker' }, t('yourMessage')),
        lastUser
          ? h('div', { className: 'ad-quote' }, lastUser.text)
          : h('div', { className: 'ad-note' }, t('noNewMessage')),
      )
    }

    /**
     * Controlled editor used by both "edit arguments" and "add guidance".
     * @param {{ value: string, onChange: (value: string) => void, onSubmit: () => void, onCancel: () => void, placeholder?: string, note: string }} props - editor props.
     * @returns {import('react').ReactElement} editor.
     */
    function PauseEditor({ value, onChange, onSubmit, onCancel, placeholder, note }) {
      return h('div', { className: 'ad-block' },
        h('textarea', {
          className: 'ad-editor',
          spellCheck: false,
          autoFocus: true,
          placeholder,
          value,
          onChange: (event) => onChange(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              onSubmit()
            }
          },
        }),
        h('div', { className: 'ad-note' }, note),
      )
    }

    /**
     * Pause actions: editor buttons when open, otherwise mode-specific actions.
     * @param {{ d: any, pending: any, isTool: boolean, isFinish: boolean, panel: string|null, setPanel: (value: string|null) => void, setDraft: (value: string) => void, submit: (action: 'edit'|'guide') => void, onCancel: () => void, t: (key: string) => string }} props - action props.
     * @returns {import('react').ReactElement} actions.
     */
    function PauseActions({ d, pending, isTool, isFinish, panel, setPanel, setDraft, submit, onCancel, t }) {
      if (panel === 'edit' || panel === 'guide') {
        return h('div', { className: 'ad-actions' },
          h('button', { type: 'button', className: 'ad-btn', disabled: d.busy, onClick: onCancel }, t('cancel')),
          h('button', {
            type: 'button',
            className: 'ad-btn',
            'data-tone': 'solid',
            disabled: d.busy,
            onClick: () => void submit(panel),
          }, panel === 'edit' ? t('runEdited') : t('addAndContinue')),
        )
      }
      const openGuide = () => {
        d.setError(null)
        setDraft('')
        setPanel('guide')
      }
      const openEdit = () => {
        d.setError(null)
        setDraft(pretty(pending.arguments ?? {}))
        setPanel('edit')
      }
      return h('div', { className: 'ad-actions' },
        isTool
          ? h(React.Fragment, null,
              h('button', { type: 'button', className: 'ad-btn', 'data-tone': 'solid', disabled: d.busy, onClick: () => void d.resolve('allow') }, t('runIt')),
              h('button', { type: 'button', className: 'ad-btn', disabled: d.busy, onClick: openEdit }, t('editArgs')),
              h('button', { type: 'button', className: 'ad-btn', disabled: d.busy, onClick: () => void d.resolve('skip') }, t('skip')),
              h('button', { type: 'button', className: 'ad-btn', 'data-tone': 'danger', disabled: d.busy, onClick: () => void d.resolve('stop') }, t('stop')),
            )
          : isFinish
            ? h(React.Fragment, null,
                h('button', { type: 'button', className: 'ad-btn', 'data-tone': 'solid', disabled: d.busy, onClick: () => void d.resolve('finish') }, t('finishTurn')),
                h('button', { type: 'button', className: 'ad-btn', disabled: d.busy, onClick: openGuide }, t('addGuidance')),
              )
            : h(React.Fragment, null,
                h('button', { type: 'button', className: 'ad-btn', 'data-tone': 'solid', disabled: d.busy, onClick: () => void d.resolve('continue') }, t('nextStep')),
                h('button', { type: 'button', className: 'ad-btn', disabled: d.busy, onClick: openGuide }, t('addGuidance')),
                h('button', { type: 'button', className: 'ad-btn', 'data-tone': 'danger', disabled: d.busy, onClick: () => void d.resolve('stop') }, t('stop')),
              ),
      )
    }

    /**
     * Paused view: conclusion, actions, inspector tabs.
     * @param {{ d: any, t: (key: string) => string, sessionId: string }} props - debugger state.
     * @returns {import('react').ReactElement} pause view.
     */
    function PauseView({ d, t, sessionId }) {
      const pending = d.pending
      const [tab, setTab] = React.useState('request')
      const [panel, setPanel] = React.useState(null)
      const [draft, setDraft] = React.useState('')
      const [inspect, setInspect] = React.useState(null)
      const [inspectError, setInspectError] = React.useState(null)

      React.useEffect(() => {
        if (pending === null) return undefined
        let alive = true
        setInspect(null)
        setInspectError(null)
        request('GET', `inspect?sessionId=${encodeURIComponent(sessionId)}`)
          .then((data) => { if (alive) setInspect(data.inspect) })
          .catch((failure) => { if (alive) setInspectError(messageOf(failure)) })
        return () => { alive = false }
      }, [pending?.id, sessionId])

      React.useEffect(() => {
        setPanel(null)
        setTab('request')
        setDraft(pending?.kind === 'tool' ? pretty(pending.arguments ?? {}) : '')
        d.setError(null)
      }, [pending?.id])

      if (pending === null) return null

      const remaining = Math.max(0, Math.ceil((pending.deadline - Date.now()) / 1000))
      const isTool = pending.kind === 'tool'
      const isFinish = pending.kind === 'finish'
      const messages = Array.isArray(pending.messages) ? pending.messages : []
      const human = messages
        .filter((message) => message.claimed === true && message.role === 'user'
          && (message.source === 'user' || message.source === null))
        .map((message) => ({ ...message, text: stripReminder(message.preview) }))
        .filter((message) => message.text.length > 0)
      const lastUser = human.at(-1) ?? null
      const finalAssistant = isFinish ? (pending.assistant ?? inspect?.result?.assistant ?? null) : null
      const onCancel = () => {
        setPanel(null)
        d.setError(null)
      }

      /**
       * Validate and submit the editor.
       * @param {'edit'|'guide'} action - action.
       * @returns {Promise<void>}
       */
      const submit = async (action) => {
        if (action === 'edit') {
          let parsed
          try {
            parsed = JSON.parse(draft)
          } catch {
            d.setError(t('invalidJson'))
            return
          }
          if (parsed === null || parsed === undefined) {
            d.setError(t('emptyArgs'))
            return
          }
          await d.resolve('edit', { arguments: parsed })
          return
        }
        const instruction = draft.trim()
        if (instruction.length === 0) {
          d.setError(t('emptyInstruction'))
          return
        }
        await d.resolve(pending.kind === 'finish' ? 'steer' : 'inject', { instruction })
      }

      return h(React.Fragment, null,
        h(PauseHeader, { pending, isTool, isFinish, remaining, t }),
        h(PauseBody, { pending, isTool, isFinish, finalAssistant, lastUser, panel, t }),
        panel === 'edit'
          ? h(PauseEditor, {
              value: draft,
              onChange: setDraft,
              onSubmit: () => void submit('edit'),
              onCancel,
              note: `${t('argsHint')} · ${t('editorKeys')}`,
            })
          : panel === 'guide'
            ? h(PauseEditor, {
                value: draft,
                onChange: setDraft,
                onSubmit: () => void submit('guide'),
                onCancel,
                placeholder: t('instructionPlaceholder'),
                note: isFinish ? t('finishGuideHint') : t('editorKeys'),
              })
            : null,
        d.error ? h('div', { className: 'ad-note ad-error', role: 'alert' }, d.error) : null,
        h(PauseActions, { d, pending, isTool, isFinish, panel, setPanel, setDraft, submit, onCancel, t }),
        h(Tabs, {
          value: tab,
          onChange: setTab,
          tabs: [
            { id: 'request', caption: t('captionInput'), label: isTool || isFinish ? t('lastRequest') : t('nextRequest') },
            { id: 'sources', caption: t('captionOrigins'), label: t('tabSources') },
            { id: 'result', caption: t('captionOutput'), label: t('tabResult') },
          ],
        }),
        tab === 'request'
          ? h(RequestTab, { inspect, inspectError, t, kind: pending.kind })
          : tab === 'sources'
            ? h(SourcesTab, { inspect, t })
            : h(ResultTab, { inspect, t, kind: pending.kind }),
        h('div', { className: 'ad-note' }, t('readOnly')),
      )
    }

    /**
     * Idle view: status, arm buttons, recent breakpoints.
     * @param {{ d: any, t: (key: string) => string }} props - debugger state.
     * @returns {import('react').ReactElement} idle view.
     */
    function IdleView({ d, t }) {
      const state = d.state
      const armed = state?.armed === true
      const stepActive = armed && state.mode === 'step'
      const toolActive = armed && state.mode === 'tool'
      const finishActive = armed && state.mode === 'finish'
      const history = state?.history ?? []
      return h(React.Fragment, null,
        h('div', { className: 'ad-head' },
          h('div', null,
            h('div', { className: 'ad-title' }, h(DebugIcon), t('idleTitle')),
            h('div', { className: 'ad-sub' }, armed ? armedDescription(state, t) : t('idleHint')),
          ),
          armed ? h('div', { className: 'ad-timer' }, t('armed')) : null,
        ),
        h('div', { className: 'ad-actions' },
          h('button', { type: 'button', className: 'ad-btn', 'data-tone': stepActive ? 'solid' : undefined, 'aria-pressed': stepActive, disabled: d.busy, onClick: () => void d.arm('step', false) }, t('stepMode')),
          h('button', { type: 'button', className: 'ad-btn', 'data-tone': toolActive ? 'solid' : undefined, 'aria-pressed': toolActive, disabled: d.busy, onClick: () => void d.arm('tool') }, t('tool')),
          h('button', { type: 'button', className: 'ad-btn', 'data-tone': finishActive ? 'solid' : undefined, 'aria-pressed': finishActive, disabled: d.busy, onClick: () => void d.arm('finish') }, t('finishMode')),
          h('button', { type: 'button', className: 'ad-btn', disabled: d.busy || !armed, onClick: () => void d.disarm() }, t('disarm')),
        ),
        h('div', { className: 'ad-text', role: 'status' }, armed ? armedStatus(state, t) : t('modeOff')),
        h('div', { className: 'ad-block' },
          h('div', { className: 'ad-kicker' }, t('toolsList')),
          h('div', { className: 'ad-text' }, (state?.tools ?? []).join(', ') || '—'),
        ),
        h('div', { className: 'ad-block' },
          h('div', { className: 'ad-kicker' }, t('recent')),
          history.length === 0
            ? h('div', { className: 'ad-note' }, t('noRecent'))
            : h('ul', { className: 'ad-list' },
                recentHistory(history).map((item, index) => h('li', { key: `h-${index}` },
                  `${new Date(item.at).toLocaleTimeString()} · ${historyLabel(item)}`,
                )),
              ),
        ),
        h('div', { className: 'ad-note' }, t('hint')),
        state?.diagError ? h('div', { className: 'ad-note' }, state.diagError) : null,
      )
    }

    /**
     * Keep a render failure inside the sidebar tab.
     */
    class PanelBoundary extends React.Component {
      /**
       * @param {any} props - boundary props.
       */
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      /**
       * @param {unknown} error - thrown error.
       * @returns {{ error: unknown }} next state.
       */
      static getDerivedStateFromError(error) {
        return { error }
      }

      /**
       * @returns {import('react').ReactElement} children or a readable failure.
       */
      render() {
        if (this.state.error !== null) {
          const t = typeof this.props.t === 'function' ? this.props.t : (key) => key
          return h('div', { className: 'ad-panel' },
            h('div', { className: 'ad-inner' },
              h('div', { className: 'ad-note ad-error' }, `${t('panelCrashed')}: ${messageOf(this.state.error)}`),
            ),
          )
        }
        return this.props.children
      }
    }

    /**
     * Right-sidebar page.
     * @param {{ sessionId: string, t?: (key: string) => string }} props - tab props.
     * @returns {import('react').ReactElement} panel.
     */
    function DebuggerPanel({ sessionId, t: injected }) {
      const t = typeof injected === 'function' ? injected : translate
      const d = useDebugger(sessionId, t)
      const scrollRef = React.useRef(null)
      React.useEffect(() => {
        const element = scrollRef.current
        if (element !== null) element.scrollTop = 0
      }, [d.pending?.id])
      return h(PanelBoundary, { t },
        h('div', { ref: scrollRef, className: 'ad-panel', 'data-dsh-plugin': 'agent-debugger-panel' },
          h('div', { className: 'ad-inner' },
            d.pending ? h(PauseView, { d, t, sessionId }) : h(IdleView, { d, t }),
          ),
        ),
      )
    }

    /**
     * Minimal pending actions shown in the composer dock.
     * @param {{ d: any, pending: any, t: (key: string) => string, onOpen: () => void }} props - action props.
     * @returns {import('react').ReactElement} actions.
     */
    function DockPendingActions({ d, pending, t, onOpen }) {
      return h(React.Fragment, null,
        h('button', { type: 'button', className: 'dbg-btn', disabled: d.busy, onClick: onOpen }, t('openPanel')),
        pending.kind === 'tool'
          ? h('button', { type: 'button', className: 'dbg-btn', disabled: d.busy, onClick: () => void d.resolve('allow') }, t('runIt'))
          : pending.kind === 'finish'
            ? h('button', { type: 'button', className: 'dbg-btn', 'data-tone': 'solid', disabled: d.busy, onClick: () => void d.resolve('finish') }, t('finishTurn'))
            : h('button', { type: 'button', className: 'dbg-btn', disabled: d.busy, onClick: () => void d.resolve('continue') }, t('nextStep')),
        pending.kind === 'finish'
          ? null
          : h('button', { type: 'button', className: 'dbg-btn', 'data-tone': 'danger', disabled: d.busy, onClick: () => void d.resolve('stop') }, t('stop')),
      )
    }

    /**
     * Idle dock actions: step, next tool, off, details.
     * @param {{ d: any, t: (key: string) => string, open: boolean, onToggle: () => void }} props - action props.
     * @returns {import('react').ReactElement} actions.
     */
    function DockIdleActions({ d, t, open, onToggle }) {
      const armed = d.state?.armed === true
      return h(React.Fragment, null,
        h('button', {
          type: 'button',
          className: 'dbg-btn',
          'aria-pressed': armed && d.state.mode === 'step',
          disabled: d.busy,
          onClick: () => void d.arm('step', false),
        }, t('stepMode')),
        h('button', {
          type: 'button',
          className: 'dbg-btn',
          'aria-pressed': armed && d.state.mode === 'tool',
          disabled: d.busy,
          onClick: () => void d.arm('tool'),
        }, t('tool')),
        h('button', {
          type: 'button',
          className: 'dbg-btn',
          disabled: d.busy || !armed,
          onClick: () => void d.disarm(),
        }, t('disarm')),
        h('button', {
          type: 'button',
          className: 'dbg-btn',
          'aria-expanded': open,
          onClick: onToggle,
        }, open ? t('hide') : t('details')),
      )
    }

    /**
     * Composer dock: arm, status, open panel; a minimal release fallback.
     * @param {{ sessionId: string, t?: (key: string) => string }} props - slot props.
     * @returns {import('react').ReactElement} dock.
     */
    function DebuggerDock(props) {
      const t = typeof props.t === 'function' ? props.t : (key) => en[key] ?? key
      translate = t
      const sessionId = props.sessionId
      const d = useDebugger(sessionId, t)
      const pending = d.pending
      const [open, setOpen] = React.useState(false)
      const sidebarReady = useAutoOpenPanel(pending)

      const statusLabel = pending !== null
        ? t('paused')
        : d.loading
          ? t('loading')
          : d.state?.armed === true
            ? t('armed')
            : t('off')
      const dot = pending !== null ? 'paused' : d.state?.armed === true ? 'armed' : 'idle'
      const remaining = pending !== null ? Math.max(0, Math.ceil((pending.deadline - Date.now()) / 1000)) : 0
      const meta = pending !== null
        ? pendingMeta(pending, t, remaining)
        : d.state?.armed === true
          ? armedDescription(d.state, t)
          : d.state?.tools?.length
            ? `${t('toolsList')}: ${d.state.tools.join(', ')}`
            : ''

      return h('div', { className: 'dbg-dock' },
        h('div', { className: 'dbg-inner' },
          h('div', { className: 'dbg-row', role: 'group', 'aria-label': t('label') },
            h('span', { className: 'dbg-label' }, h(DebugIcon), t('label')),
            h('span', { className: 'dbg-dot', 'data-status': dot, 'aria-hidden': 'true' }),
            h('span', { className: 'dbg-status' }, statusLabel),
            meta ? h('span', { className: 'dbg-sep', 'aria-hidden': 'true' }, '·') : null,
            meta ? h('span', { className: 'dbg-meta', title: meta }, meta) : null,
            h('span', { className: 'dbg-actions' },
              pending !== null
                ? h(DockPendingActions, { d, pending, t, onOpen: () => void openSidebarTab() })
                : h(DockIdleActions, { d, t, open, onToggle: () => setOpen((value) => !value) }),
            ),
          ),
          pending !== null && sidebarReady === false
            ? h('div', { className: 'dbg-notice', role: 'status' }, t('sidebarUnavailable'))
            : null,
          d.error ? h('div', { className: 'dbg-notice', role: 'alert' }, d.error) : null,
          d.state?.diagError ? h('div', { className: 'dbg-notice', role: 'status' }, d.state.diagError) : null,
          open && pending === null
            ? h('div', { className: 'dbg-panel' },
                h('div', { className: 'dbg-kv' }, h('span', null, t('toolsList')), h('span', null, (d.state?.tools ?? []).join(', ') || '—')),
                h('div', { className: 'dbg-kv' }, h('span', null, t('model')), h('span', null, d.state?.header?.model ?? '—')),
                h('div', { className: 'dbg-kv' }, h('span', null, t('requestToolsLabel')), h('span', null, String(d.state?.header?.tools?.length ?? 0))),
                h('div', { className: 'dbg-section' }, t('history')),
                (d.state?.history ?? []).length === 0
                  ? h('div', { className: 'dbg-hint' }, t('noHistory'))
                  : h('ul', { className: 'dbg-list' },
                      recentHistory(d.state?.history).map((item, index) => h('li', { className: 'dbg-item', key: `h-${item.at}-${index}` },
                        h('span', null, new Date(item.at).toLocaleTimeString()),
                        h('span', null, historyLabel(item)),
                      )),
                    ),
                h('div', { className: 'dbg-hint' }, t('hint')),
              )
            : null,
        ),
      )
    }

    /**
     * Client plugin body.
     * @param {import('@deepseek-ai/cordis').Context} ctx - client context.
     */
    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-dsh-plugin', 'agent-debugger')
        style.textContent = CSS
        document.head.appendChild(style)
        return () => { style.remove() }
      }, 'agent-debugger: styles')

      ctx.effect(
        () => ctx.locale.register(NS, { zh, en }),
        'agent-debugger: dictionaries',
      )

      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'agent-debugger',
        order: 45,
        locale: NS,
        inject: (sessionId) => ({ sessionId }),
      }, DebuggerDock))

      if (typeof ctx.inject === 'function') {
        ctx.inject(['betterSidebar'], (sidebarCtx) => {
          sidebarCtx.effect(() => sidebarCtx.betterSidebar.registerTab({
            id: 'agent-debugger',
            title: () => translate('tabTitle'),
            description: () => translate('tabDesc'),
            order: 40,
            single: true,
            component: (tabProps) => h(DebuggerPanel, {
              sessionId: tabProps?.scope?.sessionId ?? tabProps?.sessionId ?? '',
              t: (key) => translate(key),
            }),
          }), 'agent-debugger: sidebar tab')
          openSidebarTab = () => {
            try {
              sidebarCtx.betterSidebar.openTab({ type: 'agent-debugger', title: translate('tabTitle') })
              return true
            } catch {
              return false
            }
          }
        })
      }
    }

    return {
      inject: ['slots', 'locale'],
      apply,
      DebuggerDock,
      DebuggerPanel,
      // Pure helpers and components are exported for the bundle's unit tests.
      toolPreview,
      diffLines,
      uiComponents: { PauseView, PauseHeader, PauseBody, PauseEditor, PauseActions, RequestTab, DockPendingActions, DockIdleActions },
    }
  },
})
