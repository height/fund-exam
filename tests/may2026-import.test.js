import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { applyMay2026Import } from '../tools/apply-may2026-import.mjs'

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)))
const review = read('../tools/may2026-import-review.json')
const bank = read('../src/data/questions.json')
const chapters = read('../tools/chapters.json')
const additions = review.questions.filter(row => row.action === 'add')

test('review accounts for all 182 source questions, including the misordered final answer', () => {
  for (const [subject, count] of [['科目一', 82], ['科目二', 100]]) {
    assert.deepEqual(review.questions.filter(row => row.subject === subject).map(row => row.sourceQuestionNo), Array.from({ length: count }, (_, i) => i + 1))
  }
  assert.equal(additions.length, 9)
  assert.equal(review.questions.filter(row => row.action === 'reject').length, 4)
  assert.equal(review.questions.filter(row => row.action === 'similar').length, 11)
  const last = additions.find(row => row.subject === '科目二' && row.sourceQuestionNo === 100)
  assert.equal(last.question.answer, 1)
  assert.equal(last.answerPage, 37)
})

test('import adds only reviewed new questions and preserves existing content, IDs and revisions', () => {
  const newIds = new Set(additions.map(row => row.id))
  const original = bank.filter(q => !newIds.has(q.id)).map(({ sourceRefs, ...q }) => q)
  const oldChapters = Object.fromEntries(Object.entries(chapters).filter(([id]) => !newIds.has(id)))
  const result = applyMay2026Import(original, oldChapters, review)
  assert.equal(result.bank.length, original.length + 9)
  assert.equal(new Set(result.bank.map(q => q.id)).size, result.bank.length)
  for (const q of original) {
    const { sourceRefs, ...preserved } = result.bank.find(item => item.id === q.id)
    assert.deepEqual(preserved, q)
  }
  for (const row of review.questions.filter(row => row.linkSource)) {
    assert.equal(result.bank.find(q => q.id === row.id).sourceRefs.filter(ref => ref.source === review.source).length, 1)
  }
  for (const row of additions) assert.equal(result.chapters[row.id], row.question.chapter)
})

test('reapplying import does not duplicate questions or source references', () => {
  assert.deepEqual(applyMay2026Import(bank, chapters, review), { bank, chapters })
})

test('a reviewed addition already stored under another ID with reordered options stops import', () => {
  const row = additions[0]
  const q = { ...structuredClone(row.question), id: 'existing-other-id' }
  q.options.reverse()
  q.answer = 3 - q.answer
  assert.throws(() => applyMay2026Import([q], { [q.id]: q.chapter }, { ...review, questions: [row] }), /重复/)
})
