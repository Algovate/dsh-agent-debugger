/**
 * Agent Debugger engine: per-session breakpoints for the next model step, the
 * next matching tool call, or the end of the current turn.
 *
 * The engine is deliberately free of Cordis/DSH imports. `index.js` supplies
 * the listeners and turns the returned outcomes into `PreStepDecision` /
 * `PreToolDecision` values, which keeps pause/resolve/timeout/edit behavior
 * testable without an agent.
 *
 * DSH freezes tool arguments before `tools/pre-execute`, so the debugger cannot
 * rewrite a call in place. "Edit" is therefore a guided retry: the plugin denies
 * the original call with the edited arguments and an explicit instruction to
 * re-issue it. The reason is model-facing and honest about what happened.
 * @module dsh-agent-debugger/engine
 */

/** Modes the debugger can arm. */
export const MODE = Object.freeze({ tool: 'tool', step: 'step', finish: 'finish' })

/**
 * Parse a requested breakpoint mode, falling back to the tool mode.
 * @param {unknown} value - mode from a command or HTTP request.
 * @returns {'tool'|'step'|'finish'} validated mode.
 */
export function normalizeMode(value) {
  if (value === MODE.step) return MODE.step
  if (value === MODE.finish) return MODE.finish
  return MODE.tool
}

/**
 * Whether a tool name matches one of the configured patterns.
 * `*` matches everything, a trailing `*` is a prefix match, otherwise exact.
 * @param {string} name - tool name.
 * @param {string[]} patterns - configured patterns.
 * @returns {boolean} matched.
 */
export function matchesTool(name, patterns) {
  if (typeof name !== 'string' || name.length === 0) return false
  const list = Array.isArray(patterns) ? patterns : []
  for (const raw of list) {
    const pattern = String(raw).trim()
    if (pattern.length === 0) continue
    if (pattern === '*') return true
    if (pattern.endsWith('*')) {
      if (name.startsWith(pattern.slice(0, -1))) return true
    } else if (name === pattern) {
      return true
    }
  }
  return false
}

/**
 * Parse an edited argument payload.
 * @param {unknown} value - object or JSON string.
 * @returns {{ ok: true, value: unknown } | { ok: false, error: string }} parsed value.
 */
export function parseEditedArguments(value) {
  if (typeof value === 'string') {
    const text = value.trim()
    if (text.length === 0) return { ok: false, error: 'arguments must not be empty' }
    try {
      return { ok: true, value: JSON.parse(text) }
    } catch {
      return { ok: false, error: 'arguments must be valid JSON' }
    }
  }
  if (value === undefined || value === null) return { ok: false, error: 'arguments are required' }
  return { ok: true, value }
}

/**
 * Validate and trim a debugger instruction.
 * @param {unknown} value - instruction text.
 * @returns {{ ok: true, value: string } | { ok: false, error: string }} parsed instruction.
 */
export function parseInstruction(value) {
  const instruction = typeof value === 'string' ? value.trim() : ''
  if (instruction.length === 0) return { ok: false, error: 'instruction must not be empty' }
  if (instruction.length > 4000) return { ok: false, error: 'instruction is too long (max 4000 chars)' }
  return { ok: true, value: instruction }
}

/**
 * Build the model-facing reason for a guided retry after an edit.
 * @param {string} tool - tool name.
 * @param {unknown} original - arguments the model requested.
 * @param {unknown} edited - arguments the user supplied.
 * @returns {string} denial reason.
 */
export function buildEditReason(tool, original, edited) {
  const text = [
    `[agent-debugger] The user paused this ${tool} call before it ran and edited its arguments.`,
    '',
    `Original arguments: ${stableJson(original)}`,
    `Edited arguments: ${stableJson(edited)}`,
    '',
    `Re-issue ${tool} with exactly the edited arguments. Do not change other arguments and do not add unrelated calls.`,
    'If the edited call is no longer appropriate, explain why instead of running it.',
  ].join('\n')
  return text.length > 8000 ? `${text.slice(0, 8000)}\n…` : text
}

/**
 * Build the denial reason for a skipped call.
 * @param {string} tool - tool name.
 * @returns {string} denial reason.
 */
export function buildSkipReason(tool) {
  return `[agent-debugger] The user skipped this ${tool} call in the debugger. Do not retry the same call; choose another approach or report what is blocked.`
}

/**
 * One-line state summary for `/debug status`.
 * @param {any} state - public state.
 * @returns {string} summary.
 */
export function formatState(state) {
  const parts = []
  if (!state.armed) parts.push('off')
  else parts.push(describeMode(state))
  if (state.armed && state.once) parts.push('one-shot')
  if (state.mode === MODE.tool) parts.push(`tools: ${state.tools.join(',') || '(none)'}`)
  if (state.pending) parts.push(`paused at ${describePending(state.pending)}`)
  if (state.turnEnded && state.mode === MODE.step) parts.push('turn ended; next message pauses at step 1')
  if (state.history.length > 0) parts.push(`${state.history.length} event(s)`)
  return `Agent Debugger: ${parts.join(' · ')}`
}

/**
 * @param {any} state - armed state.
 * @returns {string} human mode summary.
 */
function describeMode(state) {
  if (state.mode === MODE.step) return state.once ? 'armed for next step' : 'armed for every step'
  if (state.mode === MODE.finish) return state.once ? 'armed for the next turn end' : 'armed for every turn end'
  return 'armed for next tool'
}

/**
 * @param {any} pending - pending breakpoint.
 * @returns {string} human pause location.
 */
function describePending(pending) {
  if (pending.kind === MODE.tool) return pending.tool
  if (pending.kind === MODE.finish) return 'turn end'
  return `step ${pending.step}`
}

/**
 * Per-session debugger engine.
 */
export class AgentDebuggerEngine {
  /** @type {Map<string, any>} */
  #states = new Map()
  /** @type {any} */
  #config
  /** @type {{ warn: (message: string) => void }} */
  #logger
  /** @type {() => number} */
  #now
  /** @type {number} */
  #counter = 0

  /**
   * @param {{ config: { tools: string[], autoAllowAfterMs: number, maxHistory: number, maxPromptChars: number }, now?: () => number, logger?: { warn: (message: string) => void } }} options - dependencies.
   */
  constructor(options) {
    this.#config = options.config
    this.#now = options.now ?? Date.now
    this.#logger = options.logger ?? { warn: (message) => console.warn(message) }
  }

  /**
   * Arm one session.
   * @param {string} sessionId - session identity.
   * @param {{ mode?: 'tool'|'step'|'finish', once?: boolean }} [options] - breakpoint mode.
   * @returns {any} public state.
   */
  arm(sessionId, options = {}) {
    const state = this.#state(sessionId)
    if (state.pending !== null) {
      state.diagError = 'Resolve the pending breakpoint before changing breakpoint mode.'
      state.updatedAt = this.#now()
      return this.status(sessionId)
    }
    state.armed = true
    state.mode = normalizeMode(options.mode)
    state.once = options.once !== false
    state.diagError = null
    state.updatedAt = this.#now()
    return this.status(sessionId)
  }

  /**
   * Disarm one session. A pending breakpoint is released with its safe default.
   * @param {string} sessionId - session identity.
   * @returns {any} public state.
   */
  disarm(sessionId) {
    const state = this.#state(sessionId)
    this.#release(state, 'disarm')
    state.armed = false
    state.updatedAt = this.#now()
    return this.status(sessionId)
  }

  /**
   * Drop one session's state.
   * @param {string} sessionId - session identity.
   * @returns {void}
   */
  forget(sessionId) {
    const state = this.#states.get(sessionId)
    if (state === undefined) return
    this.#release(state, 'session-disposed')
    this.#states.delete(sessionId)
  }

  /**
   * Public state for one session.
   * @param {string} sessionId - session identity.
   * @returns {any} detached public state.
   */
  status(sessionId) {
    const state = this.#state(sessionId)
    return {
      sessionId,
      armed: state.armed,
      mode: state.mode,
      once: state.once,
      tools: [...state.tools],
      pending: state.pending === null ? null : publicPending(state.pending),
      assembly: state.assembly,
      header: state.header,
      history: state.history.slice(-this.#config.maxHistory),
      lastResolved: state.lastResolved,
      turnEnded: state.turnEnded,
      diagError: state.diagError,
      updatedAt: state.updatedAt,
    }
  }

  /**
   * Store the last assembled prompt presentation for the inspector.
   * @param {string} sessionId - session identity.
   * @param {{ sections?: Array<{ name?: string, text?: string }>, contexts?: Array<{ name?: string, text?: string }>, variables?: Record<string, unknown> }} presentation - assembled presentation.
   * @returns {void}
   */
  setAssembly(sessionId, presentation) {
    if (presentation === null || typeof presentation !== 'object') return
    const state = this.#state(sessionId)
    const budget = this.#config.maxPromptChars
    const sectionSnapshot = this.#snapshotParts(presentation.sections, '(unnamed section)', 40, budget, 0)
    const contextSnapshot = this.#snapshotParts(presentation.contexts, '(unnamed context)', 20, budget, sectionSnapshot.used)
    const fullSections = sectionSnapshot.parts
    const fullContexts = contextSnapshot.parts
    const truncated = sectionSnapshot.truncated || contextSnapshot.truncated
    state.fullAssembly = {
      at: this.#now(),
      sections: fullSections,
      contexts: fullContexts,
      variables: Object.keys(presentation.variables ?? {}).slice(0, 30),
      totalChars: fullSections.reduce((sum, item) => sum + item.chars, 0),
      truncated,
    }
    state.assembly = {
      at: state.fullAssembly.at,
      model: state.header?.model ?? null,
      sections: fullSections.map(({ name, chars, text }) => ({ name, chars, preview: text.slice(0, 1200) })),
      contexts: fullContexts.map(({ name, chars, text }) => ({ name, chars, preview: text.slice(0, 600) })),
      variables: state.fullAssembly.variables,
      totalChars: state.fullAssembly.totalChars,
    }
    state.updatedAt = this.#now()
  }

  /**
   * Store the last request header for tool/model inspection.
   * @param {string} sessionId - session identity.
   * @param {any} header - request header.
   * @returns {void}
   */
  setHeader(sessionId, header) {
    if (header === null || typeof header !== 'object') return
    const state = this.#state(sessionId)
    const tools = Array.isArray(header.tools)
      ? header.tools.slice(0, 100).map((tool) => ({
          name: typeof tool?.name === 'string' ? tool.name : '?',
          description: typeof tool?.description === 'string' ? tool.description : '',
          parameters: tool?.parameters ?? null,
        }))
      : []
    state.requestHeader = {
      at: this.#now(),
      config: header.config ?? null,
      adapterDefaults: header.adapterDefaults ?? null,
      tools,
    }
    state.header = {
      at: state.requestHeader.at,
      provider: header.config?.provider ?? null,
      model: header.config?.model ?? null,
      tools: tools.map((tool) => tool.name),
    }
    state.updatedAt = this.#now()
  }

  /**
   * Pause before a tool call when the session is armed for tools.
   * @param {{ sessionId: string, tool: string, arguments: unknown, callId?: string, signal?: AbortSignal }} input - pending call.
   * @returns {Promise<{ action: 'allow'|'skip'|'edit'|'stop', reason?: string, arguments?: unknown }>} outcome.
   */
  async pauseTool(input) {
    const state = this.#state(input.sessionId)
    if (!this.#canPause(state, MODE.tool, input.signal)) return { action: 'allow' }
    if (!matchesTool(input.tool, state.tools)) return { action: 'allow' }
    return await this.#pause(state, {
      kind: MODE.tool,
      tool: input.tool,
      arguments: cloneJson(input.arguments),
      callId: input.callId ?? null,
    }, input.signal, 'allow')
  }

  /**
   * Pause before a model step when the session is armed for steps.
   * @param {{ sessionId: string, turn: number, step: number, messages: Array<any>, signal?: AbortSignal }} input - step facts.
   * @returns {Promise<{ action: 'continue'|'inject'|'stop', instruction?: string }>} outcome.
   */
  async pauseStep(input) {
    const state = this.#state(input.sessionId)
    if (!this.#canPause(state, MODE.step, input.signal)) return { action: 'continue' }
    return await this.#pause(state, {
      kind: MODE.step,
      turn: input.turn,
      step: input.step,
      messages: Array.isArray(input.messages) ? input.messages : [],
    }, input.signal, 'continue')
  }

  /**
   * Pause before the current turn closes when the session is armed for finish.
   * The final assistant message is snapshotted so the panel does not depend on
   * an asynchronous inspector fetch.
   * @param {{ sessionId: string, turn: number, signal?: AbortSignal }} input - turn facts.
   * @returns {Promise<{ action: 'finish'|'steer', instruction?: string }>} outcome.
   */
  async pauseFinish(input) {
    const state = this.#state(input.sessionId)
    if (!this.#canPause(state, MODE.finish, input.signal)) return { action: 'finish' }
    return await this.#pause(state, {
      kind: MODE.finish,
      turn: input.turn,
      assistant: finishSnapshot(state.lastAssistant),
    }, input.signal, 'finish')
  }

  /**
   * Resolve the current breakpoint.
   * @param {string} sessionId - session identity.
   * @param {{ id?: string, action: string, arguments?: unknown, instruction?: string }} input - user decision.
   * @returns {{ ok: true, state: any } | { ok: false, error: string }} result.
   */
  resolve(sessionId, input) {
    const state = this.#states.get(sessionId)
    if (state === undefined || state.pending === null) return { ok: false, error: 'no breakpoint is pending' }
    const pending = state.pending
    if (typeof input?.id === 'string' && input.id.length > 0 && input.id !== pending.id) {
      return { ok: false, error: 'this breakpoint is stale' }
    }
    const action = typeof input?.action === 'string' ? input.action.toLowerCase() : ''
    if (pending.kind === MODE.tool) {
      if (action === 'allow') {
        this.#settle(state, { action: 'allow' }, 'allow')
        return { ok: true, state: this.status(sessionId) }
      }
      if (action === 'skip') {
        this.#settle(state, { action: 'skip', reason: buildSkipReason(pending.tool) }, 'skip')
        return { ok: true, state: this.status(sessionId) }
      }
      if (action === 'edit') {
        const parsed = parseEditedArguments(input?.arguments)
        if (parsed.ok !== true) return { ok: false, error: parsed.error }
        const reason = buildEditReason(pending.tool, pending.arguments, parsed.value)
        this.#settle(state, { action: 'edit', reason, arguments: parsed.value }, 'edit')
        return { ok: true, state: this.status(sessionId) }
      }
      if (action === 'stop') {
        this.#settle(state, { action: 'stop' }, 'stop')
        return { ok: true, state: this.status(sessionId) }
      }
      return { ok: false, error: `unsupported tool action: ${action}` }
    }
    if (pending.kind === MODE.finish) {
      if (action === 'finish') {
        this.#settle(state, { action: 'finish' }, 'finish')
        return { ok: true, state: this.status(sessionId) }
      }
      if (action === 'steer') return this.#settleInstruction(state, sessionId, input, 'steer')
      return { ok: false, error: `unsupported finish action: ${action}` }
    }
    if (action === 'continue') {
      this.#settle(state, { action: 'continue' }, 'continue')
      return { ok: true, state: this.status(sessionId) }
    }
    if (action === 'inject') return this.#settleInstruction(state, sessionId, input, 'inject')
    if (action === 'stop') {
      this.#settle(state, { action: 'stop' }, 'stop')
      return { ok: true, state: this.status(sessionId) }
    }
    return { ok: false, error: `unsupported step action: ${action}` }
  }

  /**
   * Store the reconstructed model-visible message sequence at pause time.
   * @param {string} sessionId - session identity.
   * @param {Array<{ role: string, source: string | null, chars: number, preview: string }>} messages - message previews.
   * @returns {void}
   */
  setRequestMessages(sessionId, messages) {
    const state = this.#state(sessionId)
    state.requestMessages = Array.isArray(messages) ? messages.slice(-24) : []
    state.updatedAt = this.#now()
  }

  /**
   * Observe one session event for the request/response inspector.
   * @param {any} event - session event.
   * @returns {void}
   */
  observeEvent(sessionId, event) {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return
    if (event === null || typeof event !== 'object') return
    if (event.type === 'request/header') {
      this.setHeader(sessionId, event.data?.header)
      return
    }
    const state = this.#state(sessionId)
    if (event.type === 'assistant/message') this.#observeAssistant(state, event)
    else if (event.type === 'tool/call') this.#observeToolCall(state, event)
    else if (event.type === 'tool/result') this.#observeToolResult(state, event)
  }

  /**
   * @param {any} state - session state.
   * @param {any} event - assistant/message event.
   * @returns {void}
   */
  #observeAssistant(state, event) {
    const message = event.data?.message
    const blocks = Array.isArray(message?.content) ? message.content : []
    const text = blocks.filter((block) => block?.type === 'text' && typeof block.text === 'string').map((block) => block.text).join('\n')
    const reasoning = blocks.filter((block) => block?.type === 'reasoning' && typeof block.text === 'string').map((block) => block.text).join('\n')
    const toolCalls = blocks.filter((block) => block?.type === 'tool-call').slice(0, 20).map((block) => ({
      callId: block.callId ?? block.id ?? null,
      name: typeof block.name === 'string' ? block.name : null,
      arguments: block.arguments ?? null,
    }))
    state.lastAssistant = {
      at: typeof event.time === 'number' ? event.time : this.#now(),
      text: text.slice(0, 20000),
      reasoning: reasoning.slice(0, 8000),
      toolCalls,
      usage: event.data?.usage ?? null,
      finish: message?.finish ?? event.data?.finish ?? finishFromStream(event.data?.stream),
      interrupted: event.data?.interrupted === true,
    }
  }

  /**
   * @param {any} state - session state.
   * @param {any} event - tool/call event.
   * @returns {void}
   */
  #observeToolCall(state, event) {
    const callId = event.data?.callId
    if (typeof callId !== 'string') return
    const name = typeof event.data?.name === 'string' ? event.data.name : null
    state.calls.set(callId, { name, arguments: event.data?.arguments ?? null, at: this.#now() })
    while (state.calls.size > 50) state.calls.delete(state.calls.keys().next().value)
    if (name === null) return
    state.toolNames.set(callId, name)
    while (state.toolNames.size > 100) state.toolNames.delete(state.toolNames.keys().next().value)
  }

  /**
   * @param {any} state - session state.
   * @param {any} event - tool/result event.
   * @returns {void}
   */
  #observeToolResult(state, event) {
    const callId = event.data?.message?.toolCallId
    const call = typeof callId === 'string' ? state.calls.get(callId) : undefined
    state.lastTool = {
      at: typeof event.time === 'number' ? event.time : this.#now(),
      callId: callId ?? null,
      name: call?.name ?? null,
      arguments: call?.arguments ?? null,
      isError: event.data?.message?.isError === true,
      output: blocksText(event.data?.message?.content).slice(0, 20000),
    }
    if (typeof callId === 'string') state.calls.delete(callId)
  }

  /**
   * Full request/response snapshot for the panel's inspector. Kept out of the
   * polled state so a large prompt is only transferred when requested.
   * @param {string} sessionId - session identity.
   * @returns {any} inspector payload.
   */
  inspect(sessionId) {
    const state = this.#state(sessionId)
    return {
      sessionId,
      updatedAt: state.updatedAt,
      request: {
        config: state.requestHeader?.config ?? null,
        adapterDefaults: state.requestHeader?.adapterDefaults ?? null,
        tools: state.requestHeader?.tools ?? [],
        sections: state.fullAssembly?.sections ?? [],
        contexts: state.fullAssembly?.contexts ?? [],
        messages: state.requestMessages.map((message) => ({
          ...message,
          ...(message.toolCallId ? { toolName: state.toolNames.get(message.toolCallId) ?? null } : {}),
        })),
        totalChars: state.fullAssembly?.totalChars ?? 0,
        truncated: state.fullAssembly?.truncated === true,
      },
      result: {
        assistant: state.lastAssistant,
        tool: state.lastTool,
      },
      notes: {
        toolOwner: 'request/header records tool declarations, not the plugin that registered them',
        messages: 'reconstructed from session surface events',
      },
    }
  }

  /**
   * Mark that the session's turn ended; the next message starts a new one.
   * @param {string} sessionId - session identity.
   * @returns {void}
   */
  noteTurnEnd(sessionId) {
    const state = this.#state(sessionId)
    state.turnEnded = true
    state.updatedAt = this.#now()
  }

  /**
   * Mark that a new turn started.
   * @param {string} sessionId - session identity.
   * @returns {void}
   */
  noteTurnStart(sessionId) {
    const state = this.#state(sessionId)
    state.turnEnded = false
    state.updatedAt = this.#now()
  }

  /**
   * Record a non-fatal diagnostic that the dock can show.
   * @param {string} sessionId - session identity.
   * @param {string} message - short diagnostic.
   * @returns {void}
   */
  noteError(sessionId, message) {
    const state = this.#state(sessionId)
    state.diagError = String(message).slice(0, 240)
    state.updatedAt = this.#now()
  }

  /**
   * Release every pending breakpoint and clear state.
   * @returns {void}
   */
  disposeAll() {
    for (const state of this.#states.values()) this.#release(state, 'dispose')
    this.#states.clear()
  }

  /**
   * Validate guidance and settle the current breakpoint with it.
   * @param {any} state - session state.
   * @param {string} sessionId - session identity.
   * @param {{ instruction?: unknown }} input - user decision.
   * @param {'steer'|'inject'} action - resolved action.
   * @returns {{ ok: true, state: any } | { ok: false, error: string }} result.
   */
  #settleInstruction(state, sessionId, input, action) {
    const parsed = parseInstruction(input?.instruction)
    if (parsed.ok !== true) return { ok: false, error: parsed.error }
    this.#settle(state, { action, instruction: parsed.value }, action)
    return { ok: true, state: this.status(sessionId) }
  }

  /**
   * Snapshot prompt parts under one shared character budget.
   * @param {any} items - sections or contexts.
   * @param {string} fallbackName - name used when a part is unnamed.
   * @param {number} maxParts - hard count cap.
   * @param {number} budget - total character budget.
   * @param {number} used - characters already consumed.
   * @returns {{ parts: Array<{ name: string, chars: number, text: string }>, used: number, truncated: boolean }} snapshot.
   */
  #snapshotParts(items, fallbackName, maxParts, budget, used) {
    const parts = []
    let consumed = used
    let truncated = false
    for (const item of Array.isArray(items) ? items : []) {
      const name = typeof item?.name === 'string' && item.name.length > 0 ? item.name : fallbackName
      const text = typeof item?.text === 'string' ? item.text : ''
      const kept = consumed < budget ? text.slice(0, Math.max(0, budget - consumed)) : ''
      if (kept.length < text.length) truncated = true
      consumed += kept.length
      parts.push({ name, chars: text.length, text: kept })
      if (parts.length >= maxParts) break
    }
    return { parts, used: consumed, truncated }
  }

  /**
   * Release a pending breakpoint with its safe default.
   * @param {any} state - session state.
   * @param {string} reason - why it was released.
   * @returns {void}
   */
  #release(state, reason) {
    if (state.pending === null) return
    this.#settle(state, { action: releaseAction(state.pending.kind) }, reason)
  }

  /**
   * Whether a new breakpoint may park right now.
   * @param {any} state - session state.
   * @param {'tool'|'step'|'finish'} mode - expected mode.
   * @param {AbortSignal | undefined} signal - turn cancellation.
   * @returns {boolean} true when the pause is allowed.
   */
  #canPause(state, mode, signal) {
    return state.armed === true
      && state.mode === mode
      && state.pending === null
      && signal?.aborted !== true
  }

  /**
   * @param {string} sessionId - session identity.
   * @returns {any} mutable state.
   */
  #state(sessionId) {
    let state = this.#states.get(sessionId)
    if (state === undefined) {
      state = {
        sessionId,
        armed: false,
        mode: MODE.tool,
        once: true,
        tools: [...this.#config.tools],
        pending: null,
        assembly: null,
        fullAssembly: null,
        header: null,
        requestHeader: null,
        requestMessages: [],
        calls: new Map(),
        toolNames: new Map(),
        lastAssistant: null,
        lastTool: null,
        turnEnded: false,
        diagError: null,
        history: [],
        lastResolved: null,
        updatedAt: this.#now(),
      }
      this.#states.set(sessionId, state)
      if (this.#states.size > 50) {
        for (const [id, other] of this.#states) {
          if (id !== sessionId && other.armed !== true && other.pending === null) {
            this.#states.delete(id)
            break
          }
        }
      }
    }
    return state
  }

  /**
   * Park one breakpoint until the UI resolves it, the signal aborts, or the
   * auto-allow deadline passes.
   * @param {any} state - session state.
   * @param {Record<string, unknown>} record - pending facts.
   * @param {AbortSignal | undefined} signal - turn cancellation.
   * @param {'allow'|'continue'|'finish'} timeoutAction - safe default.
   * @returns {Promise<any>} outcome.
   */
  #pause(state, record, signal, timeoutAction) {
    return new Promise((resolve) => {
      const id = `bp-${++this.#counter}`
      const timer = setTimeout(() => {
        this.#settle(state, { action: timeoutAction, timeout: true }, 'timeout')
      }, this.#config.autoAllowAfterMs)
      timer.unref?.()
      const onAbort = () => {
        this.#settle(state, { action: timeoutAction, aborted: true }, 'aborted')
      }
      if (signal !== undefined) {
        if (signal.aborted) {
          clearTimeout(timer)
          resolve({ action: timeoutAction, aborted: true })
          return
        }
        signal.addEventListener('abort', onAbort, { once: true })
      }
      state.pending = {
        ...record,
        id,
        at: this.#now(),
        deadline: this.#now() + this.#config.autoAllowAfterMs,
        resolve,
        timer,
        signal,
        onAbort,
      }
      state.updatedAt = this.#now()
    })
  }

  /**
   * Complete the current breakpoint.
   * @param {any} state - session state.
   * @param {any} outcome - outcome returned to the listener.
   * @param {string} action - recorded action.
   * @returns {void}
   */
  #settle(state, outcome, action) {
    const pending = state.pending
    if (pending === null) return
    clearTimeout(pending.timer)
    if (pending.signal !== undefined && pending.onAbort !== undefined) {
      pending.signal.removeEventListener('abort', pending.onAbort)
    }
    state.pending = null
    state.lastResolved = {
      id: pending.id,
      kind: pending.kind,
      tool: pending.tool ?? null,
      action,
      at: this.#now(),
    }
    state.history.push({
      at: this.#now(),
      kind: pending.kind,
      tool: pending.tool ?? null,
      action,
      timeout: outcome?.timeout === true,
    })
    if (state.history.length > this.#config.maxHistory) state.history.shift()
    state.diagError = null
    if (state.once || action === 'stop' || action === 'timeout' || action === 'aborted'
      || action === 'disarm' || action === 'session-disposed' || action === 'dispose') {
      state.armed = false
    }
    state.updatedAt = this.#now()
    try {
      pending.resolve(outcome)
    } catch (error) {
      this.#logger.warn(`[agent-debugger] could not resolve a breakpoint: ${messageOf(error)}`)
    }
  }
}

/**
 * Public, serializable pending shape.
 * @param {any} pending - internal pending record.
 * @returns {any} public record.
 */
function publicPending(pending) {
  const base = {
    id: pending.id,
    kind: pending.kind,
    at: pending.at,
    deadline: pending.deadline,
  }
  if (pending.kind === MODE.tool) {
    return { ...base, tool: pending.tool, arguments: pending.arguments, callId: pending.callId }
  }
  if (pending.kind === MODE.finish) {
    return { ...base, turn: pending.turn, assistant: pending.assistant ?? null }
  }
  return { ...base, turn: pending.turn, step: pending.step, messages: pending.messages }
}

/**
 * Safe default when a pending breakpoint is released without a user choice.
 * @param {string} kind - pending kind.
 * @returns {'allow'|'continue'|'finish'} release action.
 */
function releaseAction(kind) {
  if (kind === MODE.tool) return 'allow'
  if (kind === MODE.finish) return 'finish'
  return 'continue'
}

/**
 * Keep only the bounded fields the finish panel needs from the last assistant.
 * @param {any} assistant - last assistant snapshot.
 * @returns {{ text: string, finish: unknown, usage: unknown } | null} compact snapshot.
 */
function finishSnapshot(assistant) {
  if (assistant === null || assistant === undefined) return null
  return {
    text: assistant.text,
    finish: assistant.finish,
    usage: assistant.usage,
  }
}

/**
 * Clone a JSON value without failing on undefined.
 * @param {unknown} value - candidate.
 * @returns {unknown} cloned value.
 */
function cloneJson(value) {
  try {
    return structuredClone(value)
  } catch {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      return null
    }
  }
}

/**
 * Stable JSON for a model-facing reason.
 * @param {unknown} value - value.
 * @returns {string} JSON text.
 */
function stableJson(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Read the finish reason from the durable assistant stream records.
 * @param {unknown} stream - AssistantStreamRecord[].
 * @returns {unknown} finish reason or null.
 */
function finishFromStream(stream) {
  if (!Array.isArray(stream)) return null
  for (let index = stream.length - 1; index >= 0; index -= 1) {
    const record = stream[index]
    if (record?.type === 'chunk' && record.chunk?.type === 'finish') return record.chunk.reason ?? null
  }
  return null
}

/**
 * Extract text blocks.
 * @param {unknown} content - message content.
 * @returns {string} joined text.
 */
function blocksText(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/**
 * @param {unknown} error - thrown value.
 * @returns {string} message text.
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
