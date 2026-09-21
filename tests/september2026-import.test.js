import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { applySeptember2026Import } from '../tools/apply-september2026-import.mjs'
const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)))
const review = read('../tools/september2026-import-review.json')
const current = { bank: read('../src/data/questions.json'), chapters: read('../tools/chapters.json'), calc: read('../src/data/calc.json') }
const added = new Set(review.questions.filter(r => r.action === 'add').map(r => r.id))
function original() {
  const data = structuredClone(current)
  data.bank = data.bank.filter(q => !added.has(q.id)).map(q => {
    if (q.sourceRefs) {
      q.sourceRefs = q.sourceRefs.filter(r => r.source !== review.source)
      if (!q.sourceRefs.length) delete q.sourceRefs
    }
    return q
  })
  for (const id of added) delete data.chapters[id]
  data.calc = data.calc.filter(id => !added.has(id))
  return data
}
const apply = (data, manifest = review) => applySeptember2026Import(data.bank, data.chapters, data.calc, manifest)

test('200题完整处置；只新增56题，既有内容与隔离状态保持不变', () => {
  const old = original(), before = structuredClone(old), result = apply(old)
  assert.deepEqual(old, before, '不修改调用方数据')
  assert.equal(result.bank.length - old.bank.length, 56)
  for (const q of old.bank) {
    const next = result.bank.find(n => n.id === q.id)
    assert.deepEqual({ ...next, sourceRefs: undefined }, { ...q, sourceRefs: undefined })
  }
  assert.deepEqual(result, current)
  assert.equal(result.calc.filter(id => id === 'sep26-2-008').length, 1)
})
test('重跑不重复增加题目、来源和计算索引', () => assert.deepEqual(apply(current), current))
test('拒收及近似题不伪装成同题来源', () => {
  for (const row of review.questions.filter(r => ['reject', 'similar'].includes(r.action))) {
    assert.ok(!current.bank.some(q => q.sourceRefs?.some(ref => ref.sourceFile === row.sourceFile && ref.sourceQuestionNo === row.sourceQuestionNo)))
  }
})
test('选项换序仍保留原题答案索引', () => {
  const row = review.questions.find(r => r.subject === '科目二' && r.sourceQuestionNo === 24)
  const q = current.bank.find(q => q.id === row.id)
  assert.equal(row.original.answer, 3)
  assert.equal(q.answer, 0)
  assert.equal(row.original.options[3], q.options[0])
})
test('题号缺失、既有内容变化、隔离目标和新增题指纹重复均阻止导入', () => {
  const missing = structuredClone(review); missing.questions.pop()
  assert.throws(() => apply(original(), missing), /完整覆盖/)
  const row = review.questions.find(r => r.action === 'duplicate')
  const changed = original(); changed.bank.find(q => q.id === row.id).answer = -1
  assert.throws(() => apply(changed), /须重新审题/)
  const isolated = original(); isolated.bank.find(q => q.id === row.id).contentReview = { status: 'pending' }
  assert.throws(() => apply(isolated), /须重新审题/)
  const duplicate = original(), addedRow = review.questions.find(r => r.action === 'add')
  duplicate.bank.push({ ...structuredClone(addedRow.question), id: 'existing-copy' })
  assert.throws(() => apply(duplicate), /重复/)
})
