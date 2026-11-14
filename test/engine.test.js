import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  AgentDebuggerEngine,
  MODE,
  buildEditReason,
  buildSkipReason,
  formatState,
  matchesTool,
  normalizeMode,
  parseEditedArguments,
  parseInstruction,
} from '../engine.js'

/**
 * @param {Partial<any>} [overrides] - config overrides.
 * @returns {AgentDebuggerEngine} engine.
 */
function createEngine(overrides = {}) {
  return new AgentDebuggerEngine({
    config: {
      tools: ['bash', 'write', 'edit'],
      autoAllowAfterMs: 60_000,
      maxHistory: 20,
      maxPromptChars: 16_000,
      ...overrides,
    },
  })
}

test('tool matching supports exact, prefix, and wildcard patterns', () => {
  assert.equal(matchesTool('bash', ['bash']), true)
  assert.equal(matchesTool('bash', ['ba*']), true)
  assert.equal(matchesTool('bash', ['*']), true)
  assert.equal(matchesTool('bash', ['write']), false)
  assert.equal(matchesTool('', ['*']), false)
})

test('arm tool mode pauses the next matching call and allow disarms once', async () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.tool, once: true })
  const nonMatch = await engine.pauseTool({ sessionId: 's1', tool: 'read', arguments: {} })
  assert.equal(nonMatch.action, 'allow')
  assert.equal(engine.status('s1').armed, true)

  const pending = engine.pauseTool({ sessionId: 's1', tool: 'bash', arguments: { command: 'ls' }, callId: 'c1' })
  const state = engine.status('s1')
  assert.equal(state.pending.kind, 'tool')
  assert.equal(state.pending.tool, 'bash')
  assert.equal(state.armed, true)

  const result = engine.resolve('s1', { id: state.pending.id, action: 'allow' })
  assert.equal(result.ok, true)
  const outcome = await pending
  assert.equal(outcome.action, 'allow')
  assert.equal(engine.status('s1').armed, false)
  assert.equal(engine.status('s1').pending, null)
})

test('edit resolves with a guided-retry reason, not a silent rewrite', async () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.tool })
  const pending = engine.pauseTool({ sessionId: 's1', tool: 'bash', arguments: { command: 'rm -rf build' } })
  const state = engine.status('s1')

  const result = engine.resolve('s1', {
    id: state.pending.id,
    action: 'edit',
    arguments: { command: 'rm -rf dist' },
  })
  assert.equal(result.ok, true)
  const outcome = await pending
  assert.equal(outcome.action, 'edit')
  assert.match(outcome.reason, /edited its arguments/)
  assert.match(outcome.reason, /rm -rf dist/)
  assert.match(outcome.reason, /Re-issue bash/)
})

test('skip returns a do-not-retry denial', async () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.tool })
  const pending = engine.pauseTool({ sessionId: 's1', tool: 'write', arguments: { path: 'a' } })
  const state = engine.status('s1')
  engine.resolve('s1', { id: state.pending.id, action: 'skip' })
  const outcome = await pending
  assert.equal(outcome.action, 'skip')
  assert.match(outcome.reason, /skipped this write call/)
  assert.match(outcome.reason, /Do not retry/)
})

test('step mode pauses and injects exactly one instruction', async () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.step })
  const pending = engine.pauseStep({
    sessionId: 's1',
    turn: 2,
    step: 3,
    messages: [{ role: 'user', source: 'user', chars: 5, preview: 'hello' }],
  })
  const state = engine.status('s1')
  assert.equal(state.pending.kind, 'step')
  assert.equal(state.pending.messages.length, 1)

  const result = engine.resolve('s1', { id: state.pending.id, action: 'inject', instruction: 'use the existing util' })
  assert.equal(result.ok, true)
  const outcome = await pending
  assert.deepEqual(outcome, { action: 'inject', instruction: 'use the existing util' })
})

test('an empty instruction is rejected and the breakpoint stays pending', () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.step })
  void engine.pauseStep({ sessionId: 's1', turn: 1, step: 1, messages: [] })
  const state = engine.status('s1')
  const result = engine.resolve('s1', { id: state.pending.id, action: 'inject', instruction: '   ' })
  assert.equal(result.ok, false)
  assert.match(result.error, /must not be empty/)
  assert.notEqual(engine.status('s1').pending, null)
  engine.disposeAll()
})

test('persistent step mode stays armed after continue and disarms on stop', async () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.step, once: false })
  const first = engine.pauseStep({ sessionId: 's1', turn: 1, step: 1, messages: [] })
  engine.resolve('s1', { id: engine.status('s1').pending.id, action: 'continue' })
  assert.equal((await first).action, 'continue')
  assert.equal(engine.status('s1').armed, true)

  const second = engine.pauseStep({ sessionId: 's1', turn: 1, step: 2, messages: [] })
  engine.resolve('s1', { id: engine.status('s1').pending.id, action: 'stop' })
  assert.equal((await second).action, 'stop')
  assert.equal(engine.status('s1').armed, false)
})

test('arming while a breakpoint is pending does not release it', async () => {
  const engine = createEngine({ autoAllowAfterMs: 5000 })
  engine.arm('s1', { mode: MODE.tool })
  const pending = engine.pauseTool({ sessionId: 's1', tool: 'bash', arguments: {} })
  const status = engine.arm('s1', { mode: MODE.step, once: false })
  assert.equal(status.pending.tool, 'bash')
  assert.equal(status.mode, MODE.tool)
  assert.match(status.diagError, /pending breakpoint/)
  engine.resolve('s1', { id: status.pending.id, action: 'allow' })
  assert.equal((await pending).action, 'allow')
  assert.equal(engine.status('s1').diagError, null)
})

test('a timeout disarms persistent step mode', async () => {
  const engine = createEngine({ autoAllowAfterMs: 40 })
  engine.arm('s1', { mode: MODE.step, once: false })
  const outcome = await engine.pauseStep({ sessionId: 's1', turn: 1, step: 1, messages: [] })
  assert.equal(outcome.action, 'continue')
  assert.equal(outcome.timeout, true)
  assert.equal(engine.status('s1').armed, false)
})

test('turn end/start is reflected in status', () => {
  const engine = createEngine()
  engine.noteTurnEnd('s1')
  assert.equal(engine.status('s1').turnEnded, true)
  engine.noteTurnStart('s1')
  assert.equal(engine.status('s1').turnEnded, false)
})

test('finish is read from the durable assistant stream', () => {
  const engine = createEngine()
  engine.observeEvent('s1', {
    type: 'assistant/message',
    data: {
      message: { content: [{ type: 'text', text: 'hi' }] },
      stream: [{ type: 'chunk', chunk: { type: 'finish', reason: { kind: 'stop' } } }],
    },
  })
  assert.deepEqual(engine.inspect('s1').result.assistant.finish, { kind: 'stop' })
})

test('a timeout releases the call and records the auto action', async () => {
  const engine = createEngine({ autoAllowAfterMs: 40 })
  engine.arm('s1', { mode: MODE.tool })
  const outcome = await engine.pauseTool({ sessionId: 's1', tool: 'bash', arguments: {} })
  assert.equal(outcome.action, 'allow')
  assert.equal(outcome.timeout, true)
  const state = engine.status('s1')
  assert.equal(state.pending, null)
  assert.equal(state.armed, false)
  assert.equal(state.history.at(-1).action, 'timeout')
})

test('an aborted turn releases the breakpoint', async () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.step })
  const controller = new AbortController()
  const pending = engine.pauseStep({ sessionId: 's1', turn: 1, step: 1, messages: [], signal: controller.signal })
  controller.abort()
  const outcome = await pending
  assert.equal(outcome.action, 'continue')
  assert.equal(outcome.aborted, true)
  assert.equal(engine.status('s1').pending, null)
})

test('disarm releases a pending breakpoint with the safe default', async () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.tool })
  const pending = engine.pauseTool({ sessionId: 's1', tool: 'bash', arguments: {} })
  engine.disarm('s1')
  const outcome = await pending
  assert.equal(outcome.action, 'allow')
  assert.equal(engine.status('s1').armed, false)
})

test('a stale breakpoint id cannot resolve the current pause', () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.tool })
  void engine.pauseTool({ sessionId: 's1', tool: 'bash', arguments: {} })
  const result = engine.resolve('s1', { id: 'bp-999', action: 'allow' })
  assert.equal(result.ok, false)
  assert.match(result.error, /stale/)
  engine.disposeAll()
})

test('the inspector keeps bounded section previews', () => {
  const engine = createEngine()
  engine.setAssembly('s1', {
    sections: [{ name: 'identity', text: 'x'.repeat(2000) }],
    contexts: [{ name: 'file-change', text: 'y'.repeat(400) }],
    variables: { cwd: '/tmp' },
  })
  const state = engine.status('s1')
  assert.equal(state.assembly.sections[0].chars, 2000)
  assert.equal(state.assembly.sections[0].preview.length, 1200)
  assert.equal(state.assembly.contexts[0].preview.length, 400)
  assert.deepEqual(state.assembly.variables, ['cwd'])
})

test('headers feed the model/tool inspector', () => {
  const engine = createEngine()
  engine.setHeader('s1', { config: { provider: 'deepseek', model: 'deepseek-test' }, tools: [{ name: 'bash' }, { name: 'read' }] })
  const state = engine.status('s1')
  assert.equal(state.header.model, 'deepseek-test')
  assert.deepEqual(state.header.tools, ['bash', 'read'])
})

test('formatting and reason helpers stay readable', () => {
  assert.match(formatState({ armed: false, mode: 'tool', once: true, tools: ['bash'], pending: null, history: [] }), /off/)
  assert.match(buildEditReason('bash', { command: 'ls' }, { command: 'ls -la' }), /Edited arguments/)
  assert.match(buildSkipReason('write'), /skipped this write call/)
})

test('the inspector keeps the full request and the last result', () => {
  const engine = createEngine()
  engine.setHeader('s1', {
    config: { provider: 'deepseek', model: 'deepseek-test', reasoningEffort: 'high' },
    tools: [{ name: 'bash', description: 'run a command', parameters: { type: 'object' } }],
  })
  engine.setAssembly('s1', {
    sections: [{ name: 'tool:bash', text: 'Check the exit code.' }],
    contexts: [{ name: 'context:file-reference', text: '@ paths resolve from the root.' }],
    variables: {},
  })
  engine.setRequestMessages('s1', [{ role: 'user', source: 'user', chars: 11, preview: 'tell a joke' }])
  engine.observeEvent('s1', {
    type: 'assistant/message',
    time: 10,
    data: { message: { content: [{ type: 'text', text: 'previous reply' }] }, usage: { inputTokens: 3, outputTokens: 4 } },
  })
  engine.observeEvent('s1', { type: 'tool/call', data: { callId: 'c1', name: 'bash', arguments: '{"command":"ls"}' } })
  engine.observeEvent('s1', {
    type: 'tool/result',
    time: 11,
    data: { message: { toolCallId: 'c1', isError: false, content: [{ type: 'text', text: 'file.txt' }] } },
  })

  const inspect = engine.inspect('s1')
  assert.equal(inspect.request.config.model, 'deepseek-test')
  assert.equal(inspect.request.tools[0].description, 'run a command')
  assert.equal(inspect.request.sections[0].text, 'Check the exit code.')
  assert.equal(inspect.request.contexts[0].name, 'context:file-reference')
  assert.equal(inspect.request.messages[0].preview, 'tell a joke')
  assert.equal(inspect.result.assistant.text, 'previous reply')
  assert.equal(inspect.result.tool.name, 'bash')
  assert.equal(inspect.result.tool.isError, false)
  assert.equal(inspect.result.tool.output, 'file.txt')
})

test('tool messages map their call id to a tool name', () => {
  const engine = createEngine()
  engine.setRequestMessages('s1', [{ role: 'tool', source: 'tool', chars: 2, preview: 'ok', toolCallId: 'c9' }])
  engine.observeEvent('s1', { type: 'tool/call', data: { callId: 'c9', name: 'bash', arguments: '{}' } })
  const inspect = engine.inspect('s1')
  assert.equal(inspect.request.messages[0].toolName, 'bash')
})

test('edited arguments parse objects and JSON strings, reject garbage', () => {
  assert.deepEqual(parseEditedArguments({ command: 'ls' }), { ok: true, value: { command: 'ls' } })
  assert.deepEqual(parseEditedArguments('{"command":"ls"}'), { ok: true, value: { command: 'ls' } })
  assert.equal(parseEditedArguments('not json').ok, false)
  assert.equal(parseEditedArguments('').ok, false)
  assert.equal(parseEditedArguments(null).ok, false)
})

test('finish mode pauses at turn end with the final answer and disarms once', async () => {
  const engine = createEngine()
  engine.observeEvent('s1', {
    type: 'assistant/message',
    data: { message: { content: [{ type: 'text', text: 'all done' }] }, usage: { outputTokens: 2 } },
  })
  engine.arm('s1', { mode: MODE.finish, once: true })
  const pending = engine.pauseFinish({ sessionId: 's1', turn: 4 })
  const state = engine.status('s1')
  assert.equal(state.pending.kind, 'finish')
  assert.equal(state.pending.turn, 4)
  assert.equal(state.pending.assistant.text, 'all done')
  assert.deepEqual(state.pending.assistant.usage, { outputTokens: 2 })

  const result = engine.resolve('s1', { id: state.pending.id, action: 'finish' })
  assert.equal(result.ok, true)
  assert.equal((await pending).action, 'finish')
  assert.equal(engine.status('s1').armed, false)
  assert.equal(engine.status('s1').history.at(-1).action, 'finish')
})

test('finish mode can steer one instruction instead of closing the turn', async () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.finish, once: true })
  const pending = engine.pauseFinish({ sessionId: 's1', turn: 2 })
  const state = engine.status('s1')
  const result = engine.resolve('s1', {
    id: state.pending.id,
    action: 'steer',
    instruction: 'run the tests before finishing',
  })
  assert.equal(result.ok, true)
  assert.deepEqual(await pending, { action: 'steer', instruction: 'run the tests before finishing' })
  assert.equal(engine.status('s1').armed, false)
  assert.equal(engine.status('s1').history.at(-1).action, 'steer')
})

test('an empty finish instruction is rejected and keeps the pause', () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.finish })
  void engine.pauseFinish({ sessionId: 's1', turn: 1 })
  const state = engine.status('s1')
  const result = engine.resolve('s1', { id: state.pending.id, action: 'steer', instruction: '  ' })
  assert.equal(result.ok, false)
  assert.match(result.error, /must not be empty/)
  assert.notEqual(engine.status('s1').pending, null)
  engine.disposeAll()
})

test('finish mode ignores a non-finish arm and reports turn end', async () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.tool })
  const outcome = await engine.pauseFinish({ sessionId: 's1', turn: 1 })
  assert.equal(outcome.action, 'finish')
  assert.equal(engine.status('s1').pending, null)
})

test('a finish timeout closes the turn and disarms persistent mode', async () => {
  const engine = createEngine({ autoAllowAfterMs: 40 })
  engine.arm('s1', { mode: MODE.finish, once: false })
  const outcome = await engine.pauseFinish({ sessionId: 's1', turn: 1 })
  assert.equal(outcome.action, 'finish')
  assert.equal(outcome.timeout, true)
  assert.equal(engine.status('s1').armed, false)
})

test('disarm releases a pending finish with the finish default', async () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.finish, once: false })
  const pending = engine.pauseFinish({ sessionId: 's1', turn: 1 })
  engine.disarm('s1')
  assert.equal((await pending).action, 'finish')
  assert.equal(engine.status('s1').armed, false)
})

test('formatState names the finish boundary', () => {
  assert.match(formatState({ armed: true, mode: 'finish', once: true, tools: [], pending: null, history: [] }), /next turn end/)
  assert.match(formatState({
    armed: true,
    mode: 'finish',
    once: false,
    tools: [],
    pending: { kind: 'finish', turn: 2 },
    history: [],
  }), /turn end/)
  assert.doesNotMatch(formatState({
    armed: true,
    mode: 'finish',
    once: true,
    tools: [],
    pending: null,
    turnEnded: true,
    history: [],
  }), /step 1/)
})

test('an aborted turn releases a finish pause with finish', async () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.finish, once: false })
  const controller = new AbortController()
  const pending = engine.pauseFinish({ sessionId: 's1', turn: 1, signal: controller.signal })
  controller.abort()
  const outcome = await pending
  assert.equal(outcome.action, 'finish')
  assert.equal(outcome.aborted, true)
  assert.equal(engine.status('s1').pending, null)
})

test('persistent finish mode stays armed after finish', async () => {
  const engine = createEngine()
  engine.arm('s1', { mode: MODE.finish, once: false })
  const pending = engine.pauseFinish({ sessionId: 's1', turn: 1 })
  engine.resolve('s1', { id: engine.status('s1').pending.id, action: 'finish' })
  assert.equal((await pending).action, 'finish')
  assert.equal(engine.status('s1').armed, true)
  engine.disposeAll()
})

test('normalizeMode accepts known modes and falls back to tool', () => {
  assert.equal(normalizeMode('step'), 'step')
  assert.equal(normalizeMode('finish'), 'finish')
  assert.equal(normalizeMode('tool'), 'tool')
  assert.equal(normalizeMode('unknown'), 'tool')
  assert.equal(normalizeMode(undefined), 'tool')
})

test('parseInstruction trims and bounds guidance', () => {
  assert.deepEqual(parseInstruction('  run tests  '), { ok: true, value: 'run tests' })
  assert.equal(parseInstruction('   ').ok, false)
  assert.equal(parseInstruction('x'.repeat(4001)).ok, false)
  assert.equal(parseInstruction('x'.repeat(4000)).ok, true)
})

test('assembly shares one budget across sections and contexts', () => {
  const engine = createEngine({ maxPromptChars: 1000 })
  engine.setAssembly('s1', {
    sections: [{ name: 'a', text: 'x'.repeat(900) }],
    contexts: [{ name: 'b', text: 'y'.repeat(300) }],
  })
  const inspect = engine.inspect('s1')
  assert.equal(inspect.request.sections[0].text.length, 900)
  assert.equal(inspect.request.contexts[0].text.length, 100)
  assert.equal(inspect.request.truncated, true)
})
