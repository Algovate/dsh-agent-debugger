/**
 * Agent Debugger — Host half.
 *
 * Three observers turn into one control surface:
 * - `agent/pre-step` pauses before the next model step, shows the assembled
 *   prompt and recent messages, and can inject one instruction or stop the turn;
 * - `tools/pre-execute` pauses before a matching tool call, shows its frozen
 *   arguments, and can allow, skip, or deny with edited arguments so the model
 *   re-issues the call;
 * - `agent/turn-stopping` pauses before the turn closes, shows the final
 *   assistant message, and can finish or steer one more step;
 * - `system-prompt/assemble` and `request/header` keep a bounded inspector
 *   snapshot (section names and previews, model, tool names).
 *
 * Nothing runs until the user arms a breakpoint in the dock or with `/debug`.
 * @module dsh-agent-debugger
 */

import { Service } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import z from '@deepseek-ai/schemastery'
import { mergePreviews, previewMessages, previewSession } from './preview.js'
import { AgentDebuggerEngine, MODE, formatState, normalizeMode } from './engine.js'

/** Row configuration. */
export const Config = z.object({
  /** Comma-separated tool names or prefixes (`write*`) that a tool breakpoint matches. */
  tools: z.string().default('bash,write,edit'),
  /** Auto-release a breakpoint after this long so a closed tab cannot hang the agent. */
  autoAllowAfterMs: z.number().step(1000).min(5000).max(600000).default(120000),
  /** Breakpoint events kept per session. */
  maxHistory: z.number().step(1).min(1).max(100).default(20),
  /** Prompt characters kept for the inspector (memory only). */
  maxPromptChars: z.number().step(1000).min(1000).max(200000).default(200000),
})

/** HTTP prefix owned by this plugin. */
const API_PREFIX = '/agent-debugger/api'
/** Request body bound: edited arguments can be large. */
const API_BODY_LIMIT = 32 * 1024

/**
 * Fill defaults for direct callers that bypass the Loader schema.
 * @param {Partial<z.infer<typeof Config>> | undefined} config - row configuration.
 * @returns {{ tools: string[], autoAllowAfterMs: number, maxHistory: number, maxPromptChars: number }} resolved values.
 */
export function resolveConfig(config) {
  const tools = String(typeof config?.tools === 'string' ? config.tools : 'bash,write,edit')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
  return {
    tools: tools.length > 0 ? [...new Set(tools)] : ['bash', 'write', 'edit'],
    autoAllowAfterMs: clampInteger(config?.autoAllowAfterMs, 5000, 600000, 120000),
    maxHistory: clampInteger(config?.maxHistory, 1, 100, 20),
    maxPromptChars: clampInteger(config?.maxPromptChars, 1000, 200000, 200000),
  }
}

/**
 * @param {unknown} value - candidate.
 * @param {number} min - lower bound.
 * @param {number} max - upper bound.
 * @param {number} fallback - default.
 * @returns {number} bounded integer.
 */
function clampInteger(value, min, max, fallback) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(numeric)))
}

/**
 * Host-side Agent Debugger service. Exposed as `ctx.agentDebugger`.
 */
export default class AgentDebuggerPlugin extends Service {
  /** Services required before the plugin activates. */
  static inject = ['commands']

  /**
   * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
   * @param {Partial<z.infer<typeof Config>> | undefined} config - validated row config.
   */
  constructor(ctx, config) {
    super(ctx, 'agentDebugger')
    this.config = resolveConfig(config)
    this.engine = new AgentDebuggerEngine({
      config: this.config,
      logger: { warn: (message) => this.#warn(message) },
    })
    this.#observe()
    this.#registerCommand()
    // The browser API is optional; a headless profile still keeps the engine
    // and the command, just without a dock.
    ctx.inject(['webServer', 'connection'], (transportCtx) => {
      this.#registerRoutes(transportCtx)
    })
    ctx.effect(() => () => this.engine.disposeAll(), 'agent-debugger: pending breakpoints')
  }

  /**
   * Public debugger state for one session.
   * @param {string} sessionId - session identity.
   * @returns {any} detached state.
   */
  status(sessionId) {
    return this.engine.status(sessionId)
  }

  /**
   * Register the three observers and the header/session bookkeeping.
   */
  #observe() {
    this.ctx.on('tools/pre-execute', async (exec, next) => {
      const sessionId = sessionIdOf(exec?.agent)
      if (sessionId === null) return next()
      this.#updateInspector(exec.agent, sessionId, 'tool inspector', () => previewSession(exec.agent, 24, 4000))
      let outcome
      try {
        outcome = await this.engine.pauseTool({
          sessionId,
          tool: exec.name,
          arguments: exec.arguments,
          callId: exec.callId,
          signal: exec.signal,
        })
      } catch (error) {
        this.#breakpointFailed(sessionId, 'tool', error)
        return next()
      }
      if (outcome.action === 'allow') return next()
      if (outcome.action === 'stop') {
        exec.agent?.cancel?.({ kind: 'user' })
        return { kind: 'cancel' }
      }
      return { kind: 'deny', reason: outcome.reason ?? 'stopped by the user in the debugger' }
    }, { global: true, prepend: true })

    this.ctx.on('agent/pre-step', async (payload, next) => {
      const decision = await next()
      if (decision.kind !== 'enter') return decision
      // A later step in the same turn can claim no new user message; the step
      // breakpoint still pauses, because the inspector reads the recent
      // session history rather than only the claimed batch.
      const sessionId = sessionIdOf(payload?.agent)
      if (sessionId === null) return decision
      this.#updateInspector(payload.agent, sessionId, 'step inspector', () => mergePreviews(
        previewSession(payload.agent, 24, 4000),
        previewMessages(decision.messages, 4000),
      ))
      let outcome
      try {
        outcome = await this.engine.pauseStep({
          sessionId,
          turn: payload.turn,
          step: payload.step,
          messages: mergePreviews(previewSession(payload.agent), previewMessages(decision.messages)),
          signal: payload.signal,
        })
      } catch (error) {
        this.#breakpointFailed(sessionId, 'step', error)
        return decision
      }
      if (outcome.action === 'continue') return decision
      if (outcome.action === 'inject') {
        return {
          ...decision,
          messages: [...decision.messages, debuggerInstruction(outcome.instruction)],
        }
      }
      payload.agent?.cancel?.({ kind: 'user' })
      return { kind: 'reject' }
    }, { global: true })

    this.ctx.on('agent/turn-stopping', async (payload) => {
      const sessionId = sessionIdOf(payload?.agent)
      if (sessionId === null) return
      let outcome
      try {
        outcome = await this.engine.pauseFinish({
          sessionId,
          turn: payload.turn,
          signal: payload.signal,
        })
      } catch (error) {
        this.#breakpointFailed(sessionId, 'finish', error)
        return
      }
      if (outcome.action !== 'steer' || typeof outcome.instruction !== 'string') return
      try {
        if (typeof payload.agent?.steer !== 'function') throw new Error('agent.steer is unavailable')
        payload.agent.steer(debuggerInstruction(outcome.instruction))
      } catch (error) {
        this.#warn(`could not steer the turn from the debugger: ${messageOf(error)}`)
        this.#diagnose(sessionId, `could not steer the turn: ${messageOf(error)}`)
      }
    }, { global: true })

    this.ctx.on('system-prompt/assemble', async (assembly, context, next) => {
      const result = await next()
      try {
        const sessionId = sessionIdOf(context?.agent)
        if (sessionId !== null) this.engine.setAssembly(sessionId, result)
      } catch (error) {
        this.#warn(`could not snapshot the assembled prompt: ${messageOf(error)}`)
      }
      return result
    }, { global: true })

    this.ctx.on('session/event', (session, event) => {
      const sessionId = sessionKey(session)
      if (sessionId === null) return
      try {
        if (event?.type === 'turn/end') this.engine.noteTurnEnd(sessionId)
        else if (event?.type === 'turn/start') this.engine.noteTurnStart(sessionId)
        this.engine.observeEvent(sessionId, event)
      } catch (error) {
        this.#warn(`could not observe a session event: ${messageOf(error)}`)
      }
    }, { global: true })

    this.ctx.on('session/disposed', (session) => {
      const sessionId = sessionKey(session)
      if (sessionId !== null) this.engine.forget(sessionId)
    }, { global: true })
  }

  /**
   * Register `/debug` for direct human control.
   */
  #registerCommand() {
    const service = this
    this.ctx.commands.register({
      name: 'debug',
      description: 'Arm, inspect, or disarm agent breakpoints for this session.',
      input: { hint: '[status | step | tool | finish | always | off]' },
      async handler({ agent, rawInput }) {
        const action = typeof rawInput === 'string' ? rawInput.trim().split(/\s+/)[0]?.toLowerCase() ?? '' : ''
        const sessionId = agent.session.header.id
        const pendingError = { kind: 'error', text: 'Resolve the pending breakpoint first.' }
        const hasPending = () => service.engine.status(sessionId).pending !== null
        if (action === 'step') {
          if (hasPending()) return pendingError
          service.engine.arm(sessionId, { mode: MODE.step, once: false })
          return { kind: 'success', text: 'Agent Debugger armed: pause before every model step. Use /debug off or Stop turn to leave.' }
        }
        if (action === 'tool') {
          if (hasPending()) return pendingError
          service.engine.arm(sessionId, { mode: MODE.tool, once: true })
          return { kind: 'success', text: `Agent Debugger armed: pause before the next matching tool call (${service.config.tools.join(', ')}).` }
        }
        if (action === 'finish') {
          if (hasPending()) return pendingError
          service.engine.arm(sessionId, { mode: MODE.finish, once: true })
          return { kind: 'success', text: 'Agent Debugger armed: pause before the turn closes.' }
        }
        if (action === 'always' || action === 'on') {
          if (hasPending()) return pendingError
          service.engine.arm(sessionId, { mode: MODE.tool, once: false })
          return { kind: 'success', text: `Agent Debugger armed for every matching tool call (${service.config.tools.join(', ')}). Use /debug off to stop.` }
        }
        if (action === 'off' || action === 'stop') {
          service.engine.disarm(sessionId)
          return { kind: 'success', text: 'Agent Debugger disarmed. Any pending breakpoint was released.' }
        }
        if (action === '' || action === 'status') {
          return { kind: 'success', text: formatState(service.engine.status(sessionId)) }
        }
        return { kind: 'error', text: 'Usage: /debug [status | step | tool | finish | always | off]' }
      },
    })
  }

  /**
   * Register the authenticated browser API used by the dock and overlay.
   * @param {import('@deepseek-ai/cordis').Context} transportCtx - context with `webServer` and `connection`.
   */
  #registerRoutes(transportCtx) {
    const service = this
    transportCtx.effect(() => transportCtx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (req, res) => {
        const rejection = transportCtx.connection.requestRejection(req)
        if (rejection !== undefined) {
          const status = typeof rejection === 'number' ? rejection : 403
          sendJson(res, status, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
          return
        }
        const url = new URL(req.url ?? '/', 'http://dsh.internal')
        const method = url.pathname.slice(API_PREFIX.length).replace(/^\/+/, '').replace(/\/+$/, '')
        try {
          if (method === 'state' && req.method === 'GET') {
            const sessionId = requireSession(res, url.searchParams.get('sessionId'))
            if (sessionId === null) return
            sendJson(res, 200, { ok: true, state: service.status(sessionId) })
            return
          }
          if (method === 'arm' && req.method === 'POST') {
            const body = await readJson(req)
            const sessionId = requireSession(res, body.sessionId)
            if (sessionId === null) return
            sendJson(res, 200, { ok: true, state: service.engine.arm(sessionId, { mode: normalizeMode(body.mode), once: body.once !== false }) })
            return
          }
          if (method === 'disarm' && req.method === 'POST') {
            const body = await readJson(req)
            const sessionId = requireSession(res, body.sessionId)
            if (sessionId === null) return
            sendJson(res, 200, { ok: true, state: service.engine.disarm(sessionId) })
            return
          }
          if (method === 'inspect' && req.method === 'GET') {
            const sessionId = requireSession(res, url.searchParams.get('sessionId'))
            if (sessionId === null) return
            sendJson(res, 200, { ok: true, inspect: service.engine.inspect(sessionId) })
            return
          }
          if (method === 'resolve' && req.method === 'POST') {
            const body = await readJson(req)
            const sessionId = requireSession(res, body.sessionId)
            if (sessionId === null) return
            const result = service.engine.resolve(sessionId, {
              id: typeof body.id === 'string' ? body.id : undefined,
              action: typeof body.action === 'string' ? body.action : '',
              arguments: body.arguments,
              instruction: typeof body.instruction === 'string' ? body.instruction : undefined,
            })
            if (result.ok !== true) {
              sendJson(res, 409, { ok: false, error: { code: 'resolve-failed', message: result.error } })
              return
            }
            sendJson(res, 200, { ok: true, state: result.state })
            return
          }
          sendJson(res, 404, { ok: false, error: { code: 'not-found', message: 'unknown Agent Debugger API method' } })
        } catch (error) {
          this.#warn(`API failure: ${messageOf(error)}`)
          sendJson(res, 500, { ok: false, error: { code: 'internal', message: messageOf(error) } })
        }
      },
    }), 'agent-debugger: browser API')
  }

  /**
   * Capture the header and a bounded message preview for the inspector.
   * @param {any} agent - live agent.
   * @param {string} sessionId - session identity.
   * @param {string} label - diagnostic prefix.
   * @param {() => any[]} messagesOf - message preview builder; may throw.
   * @returns {void}
   */
  #updateInspector(agent, sessionId, label, messagesOf) {
    try {
      const header = readRequestHeader(agent)
      if (header !== undefined) this.engine.setHeader(sessionId, header)
    } catch (error) {
      this.#warn(`${label} header failed: ${messageOf(error)}`)
    }
    try {
      this.engine.setRequestMessages(sessionId, messagesOf())
    } catch (error) {
      this.#warn(`${label} messages failed: ${messageOf(error)}`)
    }
  }

  /**
   * Report a breakpoint failure to both the log and the session diagnostic.
   * @param {string} sessionId - session identity.
   * @param {string} kind - breakpoint kind.
   * @param {unknown} error - thrown value.
   * @returns {void}
   */
  #breakpointFailed(sessionId, kind, error) {
    const message = `${kind} breakpoint failed: ${messageOf(error)}`
    this.#warn(message)
    this.#diagnose(sessionId, message)
  }

  /**
   * Record a non-fatal diagnostic on the session, never throwing into the turn.
   * @param {string} sessionId - session identity.
   * @param {string} message - short diagnostic.
   * @returns {void}
   */
  #diagnose(sessionId, message) {
    try {
      this.engine.noteError(sessionId, message)
    } catch {
      // Diagnostics must never break the hook that produced them.
    }
  }

  /**
   * Log a warning through the plugin logger when available.
   * @param {string} message - diagnostic text.
   */
  #warn(message) {
    try {
      const logger = this.ctx.logger
      if (typeof logger?.warn === 'function') logger.warn(`[agent-debugger] ${message}`)
      else console.warn(`[agent-debugger] ${message}`)
    } catch {
      console.warn(`[agent-debugger] ${message}`)
    }
  }
}

/**
 * Build a bounded preview of the latest model-visible messages for the step
 * inspector. Only short text previews are kept in memory.
 * @param {any} agent - live agent.
 * @param {number} [limit] - messages to keep.
 * @returns {Array<{ role: string, source: string | null, chars: number, preview: string }>} previews.
 */
/**
 * Read the latest request header, tolerating a method or a property exposure.
 * @param {any} agent - live agent.
 * @returns {any} header or undefined.
 */
function readRequestHeader(agent) {
  const session = agent?.session
  try {
    if (typeof session?.requestHeader === 'function') return session.requestHeader()
    if (session?.requestHeader !== undefined) return session.requestHeader
  } catch {
    return undefined
  }
  return undefined
}


/**
 * Read a session identity from an Agent.
 * @param {any} agent - live agent.
 * @returns {string | null} session id or null.
 */
function sessionIdOf(agent) {
  const id = agent?.session?.header?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/**
 * Read a session identity from a Session or an Agent-owned session.
 * @param {any} session - session object.
 * @returns {string | null} session id or null.
 */
function sessionKey(session) {
  const id = session?.id ?? session?.header?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/**
 * Build one model-visible debugger instruction.
 * @param {string} instruction - user-authored guidance.
 * @returns {import('@deepseek-ai/dsh-llm').UserMessage} user message.
 */
function debuggerInstruction(instruction) {
  return createUserMessage({
    content: [{ type: 'text', text: `[Debugger instruction] ${instruction}` }],
    source: { kind: 'agent-debugger' },
  })
}

/**
 * Validate a session id and send the standard 400 response when it is missing.
 * @param {import('node:http').ServerResponse} res - response sink.
 * @param {unknown} value - candidate session id.
 * @returns {string | null} valid session id or null after replying.
 */
function requireSession(res, value) {
  if (validSessionId(value)) return value
  sendJson(res, 400, { ok: false, error: { code: 'invalid-session', message: 'sessionId is required' } })
  return null
}

/**
 * @param {unknown} value - candidate session id.
 * @returns {boolean} plausible session id.
 */
function validSessionId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128
}

/**
 * Read a bounded JSON object body.
 * @param {import('node:http').IncomingMessage} req - request stream.
 * @returns {Promise<Record<string, unknown>>} parsed object.
 */
async function readJson(req) {
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > API_BODY_LIMIT) {
    throw new Error(`request body exceeds ${API_BODY_LIMIT} bytes`)
  }
  /** @type {Buffer[]} */
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > API_BODY_LIMIT) throw new Error(`request body exceeds ${API_BODY_LIMIT} bytes`)
    chunks.push(buffer)
  }
  if (size === 0) return {}
  const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('request body must be a JSON object')
  }
  return parsed
}

/**
 * Write one JSON response.
 * @param {import('node:http').ServerResponse} res - response sink.
 * @param {number} status - HTTP status.
 * @param {Record<string, unknown>} payload - JSON body.
 */
function sendJson(res, status, payload) {
  if (res.headersSent || res.writableEnded) return
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  })
  res.end(body)
}

/**
 * Readable message for an unknown thrown value.
 * @param {unknown} error - thrown value.
 * @returns {string} message text.
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
