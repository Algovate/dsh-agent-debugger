import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'

/**
 * Load the browser bundle in a stub realm and capture its registrations.
 * @returns {Promise<any>} captured client fixture.
 */
async function loadClient() {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  /** @type {any} */
  const captured = { config: null, exports: null, localeCalls: [], registrations: [], effects: 0, styles: [] }

  globalThis.window = {
    __ModuleLoader__: {
      load(config) {
        captured.config = config
      },
    },
  }
  globalThis.document = {
    baseURI: 'http://127.0.0.1:3000/',
    hidden: false,
    createElement() {
      return { setAttribute() {}, textContent: '', remove() {} }
    },
    head: {
      appendChild(node) {
        captured.styles.push(node)
      },
    },
  }

  // eslint-disable-next-line no-new-func
  new Function(source)()

  const React = {
    Fragment: Symbol('Fragment'),
    Component: class {
      constructor(props) {
        this.props = props
        this.state = {}
      }
      setState(next) {
        this.state = { ...this.state, ...(typeof next === 'function' ? next(this.state) : next) }
      }
    },
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useRef: (value) => ({ current: value }),
  }
  const module = captured.config.factory((specifier) => {
    if (specifier === 'react') return React
    throw new Error(`unexpected module: ${specifier}`)
  })
  captured.exports = module

  const ctx = {
    effect(fn) {
      captured.effects += 1
      const dispose = fn()
      assert.equal(typeof dispose, 'function')
      return dispose
    },
    locale: {
      register(ns, dictionaries) {
        captured.localeCalls.push({ ns, dictionaries })
        return () => {}
      },
    },
    slots: {
      inject(owner, callback) {
        assert.equal(owner, 'conversation.input.dock')
        callback()
      },
      register(spec, component) {
        captured.registrations.push({ spec, component })
        return () => {}
      },
    },
  }
  module.apply(ctx)
  return captured
}

let loaded

before(async () => {
  loaded = await loadClient()
})

after(() => {
  delete globalThis.window
  delete globalThis.document
})

test('registers a lazy factory whose id matches the package name', () => {
  assert.equal(loaded.config.id, 'dsh-agent-debugger')
  assert.equal(typeof loaded.config.factory, 'function')
})

test('declares the client services it uses', () => {
  assert.deepEqual(loaded.exports.inject, ['slots', 'locale'])
})

test('registers both baseline locale dictionaries', () => {
  assert.equal(loaded.localeCalls.length, 1)
  const [{ ns, dictionaries }] = loaded.localeCalls
  assert.equal(ns, 'agent-debugger')
  assert.ok(dictionaries.zh)
  assert.ok(dictionaries.en)
  assert.deepEqual(Object.keys(dictionaries.zh).sort(), Object.keys(dictionaries.en).sort())
})

test('contributes the dock entry with a session inject face', () => {
  assert.equal(loaded.registrations.length, 1)
  const [{ spec, component }] = loaded.registrations
  assert.equal(spec.name, 'conversation.input.dock')
  assert.equal(spec.id, 'agent-debugger')
  assert.equal(spec.order, 45)
  assert.equal(spec.locale, 'agent-debugger')
  assert.deepEqual(spec.inject('session-1'), { sessionId: 'session-1' })
  assert.equal(typeof component, 'function')
})

test('sidebar panel renders its idle view without throwing', () => {
  const tree = loaded.exports.DebuggerPanel({ sessionId: 'session-1', t: (key) => key })
  assert.equal(typeof tree.type, 'function')
  assert.equal(typeof tree.props.t, 'function')
  assert.equal(tree.children[0].type, 'div')
  assert.match(tree.children[0].props.className, /ad-panel/)
})

test('installs exactly one style element while active', () => {
  assert.equal(loaded.styles.length, 1)
  assert.equal(loaded.effects, 2)
})

test('dock renders without throwing in the stub realm', () => {
  const tree = loaded.exports.DebuggerDock({ sessionId: 'session-1', t: (key) => key })
  assert.equal(tree.type, 'div')
  assert.equal(tree.props.className, 'dbg-dock')
})

test('edit previews a line diff without reading the file', () => {
  const preview = loaded.exports.toolPreview('edit', {
    file_path: 'src/app.js',
    old_string: 'const a = 1\nconst b = 2\n',
    new_string: 'const a = 1\nconst b = 3\n',
    replace_all: true,
  })
  assert.equal(preview.kind, 'edit')
  assert.equal(preview.path, 'src/app.js')
  assert.equal(preview.replaceAll, true)
  assert.equal(preview.diff.deletions, 1)
  assert.equal(preview.diff.additions, 1)
  assert.ok(preview.diff.lines.some((line) => line.type === 'del' && line.text === 'const b = 2'))
  assert.ok(preview.diff.lines.some((line) => line.type === 'add' && line.text === 'const b = 3'))
})

test('write preview reports its line count and caps the body', () => {
  const content = `${'line\n'.repeat(1500)}tail`
  const preview = loaded.exports.toolPreview('write', { file_path: 'big.txt', content })
  assert.equal(preview.kind, 'write')
  assert.equal(preview.path, 'big.txt')
  assert.equal(preview.lines, 1501)
  assert.equal(preview.preview.length, 6000)
  assert.equal(preview.truncated, true)
})

test('patch and bash previews stay human readable', () => {
  const patch = loaded.exports.toolPreview('apply_patch', { patch: '*** Begin Patch\n*** End Patch' })
  assert.equal(patch.kind, 'patch')
  assert.match(patch.text, /Begin Patch/)
  const command = loaded.exports.toolPreview('bash', { command: 'rm -rf dist' })
  assert.deepEqual(command, { kind: 'command', text: 'rm -rf dist' })
})

test('unknown tool arguments fall back to JSON', () => {
  const preview = loaded.exports.toolPreview('read', { file_path: 'a.txt' })
  assert.equal(preview.kind, 'json')
  assert.match(preview.text, /"file_path": "a.txt"/)
})

test('diffLines handles empty sides and truncates long changed blocks', () => {
  const added = loaded.exports.diffLines('', 'one\ntwo')
  assert.equal(added.additions, 2)
  assert.equal(added.deletions, 0)
  const removed = loaded.exports.diffLines('one\ntwo', '')
  assert.equal(removed.additions, 0)
  assert.equal(removed.deletions, 2)
  const oldText = Array.from({ length: 100 }, (_, index) => `old-${index}`).join('\n')
  const newText = Array.from({ length: 100 }, (_, index) => `new-${index}`).join('\n')
  const long = loaded.exports.diffLines(oldText, newText)
  assert.equal(long.truncated, true)
  assert.equal(long.additions, 100)
  assert.equal(long.deletions, 100)
  assert.ok(long.lines.length < 100)
  assert.ok(long.lines.some((line) => line.type === 'meta'))
})

test('every literal translator key exists in both dictionaries', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  const keys = new Set([...source.matchAll(/\bt\('([^']+)'\)/g)].map((match) => match[1]))
  const [{ dictionaries }] = loaded.localeCalls
  for (const key of keys) {
    assert.ok(key in dictionaries.zh, `zh is missing ${key}`)
    assert.ok(key in dictionaries.en, `en is missing ${key}`)
  }
})

/**
 * Flatten a stub-rendered element tree into visible text.
 * @param {any} node - stub element.
 * @returns {string} visible text.
 */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  if (typeof node.type === 'function') return textOf(node.type({ ...node.props, children: node.children }))
  return textOf(node.children)
}

/**
 * Collect button labels from a stub-rendered element tree.
 * @param {any} node - stub element.
 * @returns {string[]} labels.
 */
function buttonLabels(node) {
  if (node === null || node === undefined) return []
  if (Array.isArray(node)) return node.flatMap(buttonLabels)
  if (typeof node === 'string' || typeof node === 'number') return []
  const own = node.type === 'button' ? [textOf(node)] : []
  return own.concat(buttonLabels(node.children))
}

test('finish pause renders the final answer and only finish/guidance actions', () => {
  const { PauseBody, PauseActions } = loaded.exports.uiComponents
  const t = (key) => key
  const body = PauseBody({
    pending: { kind: 'finish' },
    isTool: false,
    isFinish: true,
    finalAssistant: { text: 'all done' },
    lastUser: null,
    panel: null,
    t,
  })
  assert.match(textOf(body), /all done/)
  const actions = PauseActions({
    d: { busy: false, resolve: () => {}, setError: () => {} },
    pending: { kind: 'finish' },
    isTool: false,
    isFinish: true,
    panel: null,
    setPanel: () => {},
    setDraft: () => {},
    submit: () => {},
    onCancel: () => {},
    t,
  })
  assert.deepEqual(buttonLabels(actions), ['finishTurn', 'addGuidance'])
})

test('pause editor maps Escape to cancel and cmd/ctrl+Enter to submit', () => {
  const { PauseEditor } = loaded.exports.uiComponents
  let cancelled = 0
  let submitted = 0
  const editor = PauseEditor({
    value: 'x',
    onChange: () => {},
    onSubmit: () => { submitted += 1 },
    onCancel: () => { cancelled += 1 },
    note: 'note',
  })
  const textarea = editor.children[0]
  textarea.props.onKeyDown({ key: 'Escape', preventDefault() {} })
  textarea.props.onKeyDown({ key: 'Enter', metaKey: true, preventDefault() {} })
  assert.equal(cancelled, 1)
  assert.equal(submitted, 1)
})

test('dock pending finish offers open and finish, not stop', () => {
  const { DockPendingActions } = loaded.exports.uiComponents
  const actions = DockPendingActions({
    d: { busy: false, resolve: () => {} },
    pending: { kind: 'finish' },
    t: (key) => key,
    onOpen: () => {},
  })
  assert.deepEqual(buttonLabels(actions), ['openPanel', 'finishTurn'])
})

test('dock idle actions expose step, next tool, off, and details', () => {
  const { DockIdleActions } = loaded.exports.uiComponents
  const actions = DockIdleActions({
    d: {
      busy: false,
      state: { armed: false, mode: 'tool' },
      arm: () => {},
      disarm: () => {},
    },
    t: (key) => key,
    open: false,
    onToggle: () => {},
  })
  assert.deepEqual(buttonLabels(actions), ['stepMode', 'tool', 'disarm', 'details'])
})

test('pause view renders finish, tool, and step pendings without throwing', () => {
  const { PauseView } = loaded.exports.uiComponents
  const t = (key) => key
  /** @param {any} pending - pending breakpoint. */
  const base = (pending) => ({
    pending,
    busy: false,
    resolve: () => {},
    setError: () => {},
    state: null,
  })
  const finish = PauseView({
    d: base({
      id: 'b1',
      kind: 'finish',
      deadline: Date.now() + 1000,
      assistant: { text: 'all done' },
    }),
    t,
    sessionId: 's1',
  })
  assert.match(textOf(finish), /all done/)
  const tool = PauseView({
    d: base({
      id: 'b2',
      kind: 'tool',
      deadline: Date.now() + 1000,
      tool: 'bash',
      arguments: { command: 'ls' },
    }),
    t,
    sessionId: 's1',
  })
  assert.match(textOf(tool), /bash/)
  assert.match(textOf(tool), /ls/)
  const step = PauseView({
    d: base({
      id: 'b3',
      kind: 'step',
      deadline: Date.now() + 1000,
      step: 2,
      messages: [{ claimed: true, role: 'user', source: 'user', preview: 'hello' }],
    }),
    t,
    sessionId: 's1',
  })
  assert.match(textOf(step), /hello/)
})

test('request inspector renders request rows after the row extraction', () => {
  const { RequestTab } = loaded.exports.uiComponents
  const tree = RequestTab({
    inspect: {
      request: {
        config: { model: 'deepseek-test' },
        tools: [{ name: 'bash', description: 'run a command', parameters: { type: 'object' } }],
        sections: [{ name: 'identity', chars: 3, text: 'abc' }],
        contexts: [],
        messages: [{ role: 'user', source: 'user', chars: 2, preview: 'hi' }],
      },
    },
    inspectError: null,
    t: (key) => key,
    kind: 'tool',
  })
  const text = textOf(tree)
  assert.match(text, /deepseek-test/)
  assert.match(text, /bash/)
  assert.match(text, /identity/)
  assert.match(text, /hi/)
})
