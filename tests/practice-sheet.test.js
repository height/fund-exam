import test from 'node:test'
import assert from 'node:assert/strict'
import { practiceQuestionStatus } from '../src/lib/practiceSheet.js'

const q = { answer: 0 }
test('history distinguishes unattempted, correct and previously wrong questions', () => {
  assert.equal(practiceQuestionStatus(q).label, '未做')
  assert.equal(practiceQuestionStatus(q, { seen: 0, wrong: 3 }).label, '未做')
  assert.equal(practiceQuestionStatus(q, { seen: 1, right: 1, wrong: 0 }).label, '曾答对')
  assert.equal(practiceQuestionStatus(q, { seen: 2, right: 1, wrong: 1, wrongFlag: false }).label, '曾答错')
})
test('this round takes priority including option index zero', () => {
  assert.deepEqual(practiceQuestionStatus(q, { seen: 1, wrong: 1 }, 0), { tone: 'r', label: '本轮答对' })
  assert.deepEqual(practiceQuestionStatus(q, { seen: 1, right: 1 }, 1), { tone: 'w', label: '本轮答错' })
})
