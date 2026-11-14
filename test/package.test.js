import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'

const root = new URL('../', import.meta.url)

async function exists(path) {
  try {
    await access(new URL(path, root))
    return true
  } catch {
    return false
  }
}

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'))
}

const pkg = await json('package.json')

test('manifest declares a bundle patch, a web client, and compatibility', () => {
  assert.equal(pkg.name, 'dsh-agent-debugger')
  assert.match(pkg.version, /^0\.2\.0$/)
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.dsh.client.immediately, true)
  assert.deepEqual(pkg.dsh.client.inject, [
    '@deepseek-ai/dsh-client-ui-conversation',
    '@deepseek-ai/dsh-client-locale',
  ])
  assert.equal(pkg.dsh.manifestVersion, 1)
  assert.match(pkg.engines.dsh, /0\.2\.2/)
  assert.equal(pkg.license, 'MIT')
})

test('exports every runtime entry the loader needs', async () => {
  assert.equal(pkg.exports['.'], './index.js')
  assert.equal(pkg.exports['./client'], './client.js')
  for (const file of ['index.js', 'client.js', 'engine.js', 'cordis.patch.yml', 'icon.svg']) {
    assert.equal(await exists(file), true, `${file} must exist`)
  }
})

test('the patch inserts the package row', async () => {
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8')
  assert.match(patch, /id:\s*agent-debugger/)
  assert.match(patch, /name:\s*'dsh-agent-debugger'/)
})

test('both locales carry display metadata and a detail document', async () => {
  const en = await json('locale/en.json')
  const zh = await json('locale/zh.json')
  assert.equal(en.meta.title, 'Agent Debugger')
  assert.ok(en.meta.description.length > 40)
  assert.equal(en.meta.detail, 'docs/DETAIL.md')
  assert.equal(zh.meta.title, '智能体调试器')
  assert.ok(zh.meta.description.length > 20)
  assert.equal(zh.meta.detail, 'docs/DETAIL.zh.md')
  for (const file of ['docs/DETAIL.md', 'docs/DETAIL.zh.md', 'docs/demo.gif', 'docs/demo.html', 'README.md', 'README.en.md', 'SECURITY.md', 'docs/verification.md', 'docs/verification-history.md', 'docs/RELEASE.md']) {
    assert.equal(await exists(file), true, `${file} must exist`)
  }
})

test('the icon is a self-contained SVG', async () => {
  const icon = await readFile(new URL('icon.svg', root), 'utf8')
  assert.match(icon, /^<svg[\s>]/)
  assert.doesNotMatch(icon, /<script/i)
})

test('the engine exports the public surface used by the host and tests', async () => {
  const engine = await import(new URL('engine.js', root))
  assert.equal(typeof engine.AgentDebuggerEngine, 'function')
  assert.equal(typeof engine.matchesTool, 'function')
  assert.equal(typeof engine.buildEditReason, 'function')
  assert.equal(typeof engine.formatState, 'function')
  assert.equal(typeof engine.normalizeMode, 'function')
  assert.equal(typeof engine.parseInstruction, 'function')
})


test('every runtime module is in the published files list', async () => {
  const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
  for (const file of ['index.js', 'client.js', 'engine.js', 'preview.js']) {
    assert.ok(manifest.files.includes(file), `${file} must be packed`)
  }
})

test('release metadata points at the Algovate repository', () => {
  assert.equal(pkg.repository.type, 'git')
  assert.equal(pkg.repository.url, 'git+https://github.com/Algovate/dsh-agent-debugger.git')
  assert.equal(pkg.homepage, 'https://github.com/Algovate/dsh-agent-debugger#readme')
  assert.equal(pkg.bugs.url, 'https://github.com/Algovate/dsh-agent-debugger/issues')
  assert.equal(pkg.author, 'Algovate')
  assert.equal(pkg.publishConfig.access, 'public')
  assert.ok(pkg.files.includes('SECURITY.md'))
})
