import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { questionIssues } from '../tools/validate-question-bank.mjs'
import { applyReviewRepairs, loadReviewRepairs } from '../tools/apply-question-reviews.mjs'
import { isQuestionActive, reconcileRecord, reconcileExam } from '../src/lib/questionQuality.js'
const read = p => JSON.parse(fs.readFileSync(new URL(p, import.meta.url)))
const bank = read('../src/data/questions.json')
const audit = read('../tools/question-validity-audit.json')
const fixes = read('../tools/question-validity-repairs.json')
const byId = new Map(bank.map(q => [q.id,q]))
test('疑题处置完整，隔离题不可回流，活动题不再带过期提示', () => {
  assert.equal(audit.questions.length,91)
  assert.equal(new Set(audit.questions.map(q => q.id)).size,91)
  for (const row of audit.questions) {
    const q = byId.get(row.id)
    assert.ok(q)
    assert.equal(isQuestionActive(q), row.decision === '复核保留', row.id)
  }
  for (const q of bank.filter(isQuestionActive)) {
    assert.doesNotMatch(q.explain, /【[^】]*过期[^】]*】/)
    assert.ok(!q.review, q.id)
  }
  const q=byId.get('cd04fd7b4a64')
  assert.ok(questionIssues({...q,explain:'【试题已过期，仅供参考】'+q.explain}).some(s=>s.includes('过期提示')))
  assert.ok(questionIssues({...q,explain:'【核心考点未过期，仅供参考】'+q.explain}).some(s=>s.includes('过期提示')))
})
test('本轮补丁能从旧数据重放且重复执行不改动结果', () => {
  const old=structuredClone(bank)
  for (const fix of fixes) {
    const q=old.find(q=>q.id===fix.id)
    for (const [k,v] of Object.entries(fix.before)) if(v===null) delete q[k]; else q[k]=v
  }
  assert.deepEqual(applyReviewRepairs(old,loadReviewRepairs()),bank)
  assert.deepEqual(applyReviewRepairs(bank,loadReviewRepairs()),bank)
})
test('新增移出题归档旧记录并退出旧试卷，不丢失原始作答', () => {
  const ids=audit.questions.filter(q=>q.decision==='新增移出').map(q=>q.id)
  assert.equal(ids.length,13)
  for(const id of ids) {
    const q=byId.get(id), record={qid:id,seen:5,right:3,wrong:2,wrongFlag:true}
    const next=reconcileRecord(record,q)
    assert.equal(next.seen,0); assert.equal(next.superseded[0].seen,5)
    assert.equal(reconcileRecord(next,q),next)
  }
  const valid=byId.get('cd04fd7b4a64')
  const answers=Object.fromEntries([...ids.map(id=>[id,0]),[valid.id,valid.answer]])
  const exam=reconcileExam({ids:[...ids,valid.id],answers,total:14,right:1,score:8},id=>byId.get(id))
  assert.deepEqual(exam.ids,[valid.id]);assert.equal(exam.score,100)
  assert.equal(exam.superseded[0].ids.length,14)
})
