import test from 'node:test'
import assert from 'node:assert/strict'
import { mergePreviews, previewMessages, previewSession } from '../preview.js'

test('claimed previews are capped and flagged', () => {
  const previews = previewMessages([
    { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'x'.repeat(300) }] },
  ], 100)
  assert.equal(previews.length, 1)
  assert.equal(previews[0].preview.length, 100)
  assert.equal(previews[0].chars, 300)
  assert.equal(previews[0].claimed, true)
})

test('a claimed duplicate upgrades the kept preview', () => {
  const merged = mergePreviews(
    [{ role: 'user', source: 'user', chars: 2, preview: 'hi' }],
    [{ role: 'user', source: 'user', chars: 2, preview: 'hi', claimed: true }],
  )
  assert.equal(merged.length, 1)
  assert.equal(merged[0].claimed, true)
})

test('session previews carry tool call ids', () => {
  const agent = {
    session: {
      deriveMessages: () => [
        { role: 'tool', source: { kind: 'tool', callId: 'c1' }, content: [{ type: 'text', text: 'ok' }] },
      ],
    },
  }
  const previews = previewSession(agent, 12, 240)
  assert.equal(previews[0].toolCallId, 'c1')
  assert.equal(previews[0].claimed, undefined)
})

test('session previews fall back to surface events', () => {
  const agent = {
    session: {
      surface: {
        events: [{ data: { message: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] } } }],
      },
    },
  }
  const previews = previewSession(agent, 12, 240)
  assert.equal(previews[0].preview, 'hi')
  assert.equal(previews[0].source, 'user')
})
