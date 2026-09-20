import test from 'node:test'
import assert from 'node:assert/strict'
import { answeredRecord, latestPick, latestCorrect, latestChapterScore } from '../src/lib/practiceRecord.js'
import { chapterAccuracy } from '../src/lib/chapterAccuracy.js'
import { reconcileRecord } from '../src/lib/questionQuality.js'

const q = { id: 'q1', subject: '科目一', answer: 0, options: ['A', 'B'] }

test('redo replaces the latest result and restores option zero without losing cumulative effort', () => {
  const wrong = answeredRecord(q, undefined, 1, 10)
  const right = answeredRecord(q, wrong, 0, 20)
  const reloaded = JSON.parse(JSON.stringify(right))
  assert.equal(latestPick(q, reloaded), 0)
  assert.equal(latestCorrect(reloaded), true)
  assert.equal(reloaded.seen, 2)
  assert.equal(reloaded.right, 1)
  assert.equal(reloaded.wrong, 1)
  assert.equal(reloaded.wrongFlag, false)
  assert.equal(reloaded.lastTs, 20)
  const wrongAgain = answeredRecord(q, reloaded, 1, 30)
  assert.equal(latestCorrect(wrongAgain), false)
  assert.equal(latestPick(q, wrongAgain), 1)
  assert.equal(wrongAgain.seen, 3)
})

test('chapter bar follows the latest answer in either direction without inflating coverage', () => {
  const questions = Array.from({ length: 10 }, (_, i) => ({ ...q, id: `q${i}` }))
  const records = Object.fromEntries(questions.map((item, i) => [item.id, answeredRecord(item, null, i < 6 ? 0 : 1)]))
  const score = () => chapterAccuracy({ total: 10, ...latestChapterScore(questions, records) }).percent
  assert.equal(score(), 60)
  records.q6 = answeredRecord(questions[6], records.q6, 0)
  assert.equal(score(), 70)
  records.q0 = answeredRecord(questions[0], records.q0, 1)
  assert.equal(score(), 60)
  assert.equal(latestChapterScore(questions, records).done, 10)
})

test('legacy data and invalidated questions do not invent a selected answer or revive a stale result', () => {
  assert.equal(latestPick(q, { seen: 1, right: 1, wrong: 0 }), undefined)
  assert.equal(latestCorrect({ seen: 2, right: 1, wrong: 1, wrongFlag: false }), null)
  const old = answeredRecord(q, null, 0)
  const revised = { ...q, contentRevision: 1, materialReview: { invalidatesPriorRecords: true } }
  const record = reconcileRecord(old, revised)
  assert.equal(latestCorrect(record), null)
  assert.equal(latestPick(revised, record), undefined)
  assert.equal(record.superseded[0].lastPicked, 0)
})
