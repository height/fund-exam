import test from 'node:test'
import assert from 'node:assert/strict'
import { streamingReply } from '../src/lib/streamingReply.js'

test('every split preserves Chinese, escaped quotes, newlines and Unicode', () => {
  const reply = '条件："同一时点"\n公式 \\beta 😀'
  for (const raw of [JSON.stringify({ reply, note: null }), '{"reply":"\\u4e2d\\u6587\\ud83d\\ude00","note":null}']) {
    const expected = JSON.parse(raw).reply
    for (let i = 0; i <= raw.length; i++) assert.ok(expected.startsWith(streamingReply(raw.slice(0, i))), `split ${i}`)
    assert.equal(streamingReply(raw), expected)
  }
})
test('nested notes and JSON syntax never leak into reply', () => {
  assert.equal(streamingReply('{"note":{"reply":"private"},"reply":"visible"}'), 'visible')
  assert.equal(streamingReply('{"note":{"reply":"private"}}'), '')
  assert.equal(streamingReply('```json\n{"reply":"正文","note":{"markdown":"private"}}\n```'), '正文')
  assert.equal(streamingReply('{"reply":"末尾\\u4e'), '末尾')
})
