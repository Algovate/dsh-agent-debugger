/**
 * Pure message/prompt preview helpers for the debugger inspector.
 *
 * Kept outside the Host entry so they can be unit-tested without Cordis,
 * a live session, or the DSH plugin loader.
 * @module dsh-agent-debugger/preview
 */

/**
 * @param {unknown} content - message content blocks.
 * @returns {string} joined text.
 */
export function blocksText(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/**
 * Preview the model-visible session history.
 * @param {any} agent - live agent.
 * @param {number} [limit] - tail size.
 * @param {number} [chars] - per-message preview cap.
 * @returns {Array<{ role: string, source: string | null, chars: number, preview: string, toolCallId?: string | null }>} previews.
 */
export function previewSession(agent, limit = 12, chars = 240) {
  const session = agent?.session
  let derived = typeof session?.deriveMessages === 'function' ? session.deriveMessages() : []
  if ((!Array.isArray(derived) || derived.length === 0) && Array.isArray(session?.surface?.events)) {
    derived = session.surface.events
      .map((event) => event?.data?.message ?? event?.data)
      .filter((message) => message !== null && typeof message === 'object' && Array.isArray(message.content))
  }
  const out = []
  for (const message of (Array.isArray(derived) ? derived : []).slice(-limit)) {
    const text = blocksText(message?.content)
    if (text.length === 0) continue
    out.push({
      role: typeof message?.role === 'string' ? message.role : '?',
      source: typeof message?.source?.kind === 'string' ? message.source.kind : null,
      chars: text.length,
      preview: text.slice(0, chars),
      ...(message.role === 'tool'
        ? { toolCallId: message.source?.callId ?? message.toolCallId ?? null }
        : {}),
    })
  }
  return out
}

/**
 * Preview a batch of claimed user messages. `claimed` matters: the panel must
 * not treat earlier history as a new user message.
 * @param {Array<any>} messages - claimed messages.
 * @param {number} [chars] - per-message preview cap.
 * @returns {Array<{ role: string, source: string | null, chars: number, preview: string, claimed: true }>} previews.
 */
export function previewMessages(messages, chars = 240) {
  const out = []
  for (const message of Array.isArray(messages) ? messages : []) {
    const text = blocksText(message?.content)
    if (text.length === 0) continue
    out.push({
      role: typeof message?.role === 'string' ? message.role : 'user',
      source: typeof message?.source?.kind === 'string' ? message.source.kind : null,
      chars: text.length,
      preview: text.slice(0, chars),
      claimed: true,
      ...(message.role === 'tool'
        ? { toolCallId: message.source?.callId ?? message.toolCallId ?? null }
        : {}),
    })
  }
  return out
}

/**
 * Merge previews, dropping duplicates by role+preview so a claimed message
 * already present in the session log is not shown twice. A claimed duplicate
 * upgrades the kept copy instead of losing the flag.
 * @param {...Array<{ role: string, source: string | null, chars: number, preview: string, claimed?: boolean }>} lists - preview lists.
 * @returns {Array<{ role: string, source: string | null, chars: number, preview: string }>} merged previews.
 */
export function mergePreviews(...lists) {
  const byKey = new Map()
  for (const list of lists) {
    for (const item of list) {
      const key = `${item.role}\u0000${item.preview}`
      const existing = byKey.get(key)
      if (existing !== undefined) {
        if (item.claimed === true) existing.claimed = true
        continue
      }
      byKey.set(key, { ...item })
    }
  }
  return [...byKey.values()].slice(-12)
}
