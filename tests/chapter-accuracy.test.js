import test from 'node:test'
import assert from 'node:assert/strict'
import { chapterAccuracy } from '../src/lib/chapterAccuracy.js'

test('eligibility requires ten distinct questions, regardless of repeated attempts', () => {
  const value = chapterAccuracy({ total: 38, done: 9, assessed: 9, correct: 9 })
  assert.equal(value.percent, null)
  assert.equal(value.tone, 'pending')
  assert.match(value.label, /再做 1 题/)
})

test('empty and small chapters never receive a score or an impossible target', () => {
  for (const total of [0, 8, 38]) {
    assert.equal(chapterAccuracy({ total, done: 0, assessed: 0, correct: 0 }).percent, null)
  }
  assert.match(chapterAccuracy({ total: 8, done: 8, assessed: 8, correct: 8 }).label, /本章题量不足/)
})

test('qualification boundaries include exactly 60, 70, 80 and 90 percent', () => {
  for (const [hit, tone] of [[0, 'weak'], [59, 'weak'], [60, 'pass'], [69, 'pass'],
    [70, 'steady'], [79, 'steady'], [80, 'good'], [89, 'good'], [90, 'excellent'], [100, 'excellent']]) {
    assert.deepEqual(chapterAccuracy({ total: 100, done: 100, assessed: 100, correct: hit }),
      { tone, percent: hit, label: `正确率 ${hit}%${hit < 60 ? ' · 待加强' : ''}` })
  }
})

test('latest results do not round a failing rate up to passing', () => {
  const result = chapterAccuracy({ total: 100, done: 200, assessed: 200, correct: 119 })
  assert.equal(result.percent, 59)
  assert.equal(result.tone, 'weak')
})
