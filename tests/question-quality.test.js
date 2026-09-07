import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { reconcileRecord, reconcileExam } from '../src/lib/questionQuality.js'
import { validateBank, materialIssues } from '../tools/validate-question-bank.mjs'
const bank = JSON.parse(fs.readFileSync(new URL('../src/data/questions.json', import.meta.url)))
const repairs = JSON.parse(fs.readFileSync(new URL('../tools/question-material-repairs.json', import.meta.url)))
const find = id => bank.find(q => q.id === id)
const target = find('b332844d6b44')

test('完整题库通过材料检查；已核实材料不能被再导入覆盖', () => {
  assert.deepEqual(validateBank(bank, repairs), [])
  const broken = bank.map(q => q === target ? {...q, q: repairs.find(f => f.id === q.id).original} : q)
  assert.ok(validateBank(broken, repairs).some(i => i.includes(target.id)))
})
test('随机单题也包含原表条件，答案保持90天；同组三题可独立作答', () => {
  for (const id of ['d05b51a6d42e', target.id, 'f392de8018b2']) {
    assert.match(find(id).q, /存货周转率 \| 4/)
    assert.match(find(id).q, /权益乘数 \| 5/)
    assert.match(find(id).q, /存货 \| 1000/)
  }
  assert.equal(target.options[target.answer], '90')
  assert.equal(360 / 4, 90)
  assert.equal((2000-1000)/500, 2)
  assert.equal(1 - 1/5, .8)
  assert.match(find('6633a419f3df').q, /债券基金甲 \| 4年 \| 80%/)
  assert.match(find('3328bde972c3').q, /债券基金乙 \| 2年 \| 60%/)
})
test('9道旧缺条件题失效；2道原本能作答题不清除记录', () => {
  assert.equal(repairs.filter(f => f.invalidatesPriorRecords).length, 9)
  for (const f of repairs) {
    const r = {qid: f.id, seen: 8, right: 5, wrong: 3, wrongFlag: true, lastTs: 200}
    const next = reconcileRecord(r, find(f.id))
    if (!f.invalidatesPriorRecords) { assert.equal(next, r); continue }
    assert.equal(next.seen, 0)
    assert.equal(next.wrongFlag, false)
    assert.equal(next.superseded[0].seen, 8)
    assert.equal(next.superseded[0].right, 5)
    assert.equal(next.superseded[0].wrong, 3)
    assert.equal(reconcileRecord(next, find(f.id)), next)
  }
})
test('新版练习与新版导入记录不被清除；未知ID不受影响', () => {
  const r = {qid: target.id, contentRevision: 1, seen: 2, right: 1, wrong: 1}
  assert.equal(reconcileRecord(r, target), r)
  assert.equal(reconcileRecord(r, undefined), r)
  assert.equal(reconcileRecord(reconcileRecord({...r, contentRevision:0}, target), target).superseded.length, 1)
})
test('旧模拟考只移除缺材料题，保留原卷/原成绩并重算有效分母', () => {
  const valid = bank.find(q => !q.contentRevision)
  const e = {ids: [target.id,valid.id], answers: {[target.id]:1,[valid.id]:valid.answer}, score:50,right:1,total:2}
  const next = reconcileExam(e, find)
  assert.equal(next.score,100)
  assert.equal(next.total,1)
  assert.equal(next.superseded[0].score,50)
  assert.equal(next.superseded[0].answers[target.id],1)
  assert.deepEqual(next.voidedQuestionIds,[target.id])
  assert.equal(reconcileExam(next,find),next)
})
test('进行中试卷不会用旧题答案判新版题；全作废不生成NaN/虚假0分', () => {
  const e = {ids:[target.id], answers:{[target.id]:1}, i:0}
  assert.deepEqual(reconcileExam(e,find).ids,[])
  assert.equal(reconcileExam({...e,score:0},find).score,null)
  const fresh = {...e,questionRevisions:{[target.id]:1}}
  assert.equal(reconcileExam(fresh,find),fresh)
})
test('有标准答案也不能放过缺表题；避免把以下表述/表达误判成表格', () => {
  assert.ok(materialIssues({q:'某权证的基本要素如下表所示',answer:0}).length)
  assert.ok(materialIssues({q:'平均需要几天？',materialRequired:true}).length)
  assert.deepEqual(materialIssues({q:'以下表述正确的是，以下表达错误的是'}),[])
})
