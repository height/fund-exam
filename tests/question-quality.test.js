import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { reconcileRecord, reconcileExam, isQuestionActive } from '../src/lib/questionQuality.js'
import { validateBank, materialIssues, questionIssues } from '../tools/validate-question-bank.mjs'
import { applyReviewRepairs, loadReviewRepairs, reviewRepairIssues, applyPlainRepairs, loadPlainRepairs, plainRepairIssues } from '../tools/apply-question-reviews.mjs'
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
test('19道旧缺条件题失效；2道原本能作答题不清除记录', () => {
  assert.equal(repairs.filter(f => f.invalidatesPriorRecords).length, 19)
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

test('六道终极押题案例脱离前后题仍带原条件；D选项不再串题', () => {
  for (const id of ['6dff6bbc7241', 'd9b6175b21f8', '4a3e948d6d17']) {
    assert.match(find(id).q, /85 万元转账给了乙/)
    assert.match(find(id).q, /65 万元/)
  }
  for (const id of ['d14f531209dd', 'a652b544d28b', 'c7bdf3a5120f']) {
    assert.match(find(id).q, /50%/)
    assert.match(find(id).q, /10%的债券的风险事件/)
    assert.match(find(id).q, /公司信用风险管理委员会报告/)
  }
  assert.equal(find('cbe29748b85b').options[3], 'I、II')
})
test('补回的数表支持VaR排序、特雷诺及分红判断；港股卖出答案与交收区分', () => {
  const rows = find('d746eca6e545').q.split('\n').filter(line => /^\| \d+ \|/.test(line)).map(line => line.split('|').slice(1, 4).map(Number))
  assert.equal(rows.length, 20)
  assert.deepEqual(rows.map(r => r[1]).sort((a,b) => a-b).slice(0,2), [-5.2, -2.8])
  assert.deepEqual(rows.map(r => r[2]).sort((a,b) => a-b).slice(0,2), [-3.9, -3.1])
  assert.match(find('c75da32bb9ac').q, /β系数 \| 1.4 \| 1.9 \| 1/)
  assert.match(find('c75da32bb9ac').q, /年化收益率 \| 8% \| 10% \| 7%/)
  assert.equal(+((.08 - .02) / 1.4).toFixed(3), .043)
  assert.match(find('6b9cf34592ba').q, /基金4 \| 每10份分0.2元，现金分红 \| 每10份分0.3元，现金分红/)
  assert.equal(find('621f7f3686e6').answer, 1)
  assert.match(find('621f7f3686e6').q, /最早/)
})
test('本轮修订的计算题独立复算，含申购中间步骤不舍入', () => {
  const selected = id => find(id).options[find(id).answer].normalize('NFKC').replace(/\s/g, '')
  const round = (value, digits) => Number(value.toFixed(digits))
  assert.equal(selected('41e23636f94f'), `${10*.35}亿元`)
  assert.equal(selected('dba7d6ba5f7b'), `${360/(6000/((1200+1800)/2))}天`)
  assert.equal(selected('65074abb78e7'), String((9.88+9.55)/2))
  assert.equal(selected('047883e7bb55'), `${round((11-4)/.6,2)}%`)
  assert.equal(selected('042f9f513b5a'), `${round(.7*7.52+.3*1.12,2)}%`)
  assert.equal(selected('1fc702f34818'), `${round(10000/(1.015*1.05),2)}份`)
  assert.match(find('1fc702f34818').q, /中间步骤不舍入/)
  assert.equal(selected('21456ed08248'), `${round(1.3+.29+.02,2)}亿元`)
  assert.equal(selected('91bbfb730b81'), `${Math.round(1000000*.015/365)}和${round(1000000*.0025/365,2)}`)
  assert.equal(selected('886dd6ddc3cb'), `${round(((6+Math.sqrt(36+4*95*106))/(2*95)-1)*100,3)}%`)
  assert.equal(selected('18c24a75bddb'), `下降${8/2}个百分点`)
  assert.equal(selected('e838c79652ef'), `下跌${5*.5}%`)
})

const sample = () => ({ id: 'sample', subject: '科目二', chapter: '投资管理基础', source: '测试', q: '以下哪个数值最大？', options: ['-1', '0.5', '1', '5%'], answer: 2, explain: '1大于其余三个数值。' })
test('质量门禁拒绝空解析、占位、越界答案、重复选项、非法章节和污染选项', () => {
  assert.deepEqual(questionIssues(sample()), [])
  for (const change of [{ explain: '' }, { explain: '解析：' }, { answer: 4 }, { answer: '2' }, { options: ['A', ' A ', 'B', 'C'] }, { chapter: '未归类' }, { options: ['A', 'B', 'C', 'D（材料题）甲乙凑资'] }, { q: null }, { options: null }]) {
    assert.ok(questionIssues({ ...sample(), ...change }).length, JSON.stringify(change))
  }
  assert.deepEqual(questionIssues({...sample(), options: ['0.5', '05', '-1', '1']}), [])
  assert.ok(questionIssues({...sample(), options: ['I', 'II', 'I、II', 'I、II、III']}).some(i => i.includes('对应陈述')))
})
test('复核补丁可重复应用，恢复已知旧文但拒绝覆盖后续人工修订', () => {
  const repairs = loadReviewRepairs()
  assert.deepEqual(reviewRepairIssues(bank, repairs), [])
  assert.deepEqual(applyReviewRepairs(bank, repairs), bank)
  const fix = repairs.find(f => f.id === '886dd6ddc3cb')
  const old = bank.map(q => q.id === fix.id ? {...q, ...fix.before} : q)
  assert.deepEqual(applyReviewRepairs(old, repairs), bank)
  const edited = bank.map(q => q.id === fix.id ? {...q, explain:'人工新修订，不允许被历史补丁覆盖'} : q)
  assert.throws(() => applyReviewRepairs(edited, repairs), /停止覆盖/)
  assert.match(edited.find(q => q.id === fix.id).explain, /人工新修订/)
})
test('白话解析与新选项同步；隔离题的错误记忆法不会重新带回', () => {
  const plain = JSON.parse(fs.readFileSync(new URL('../src/data/plain.json', import.meta.url)))
  const repairs = loadPlainRepairs()
  assert.deepEqual(plainRepairIssues(plain, repairs), [])
  assert.deepEqual(applyPlainRepairs(plain, repairs), plain)
  const old = {...plain, ...Object.fromEntries(repairs.map(f => [f.id, f.before]))}
  assert.deepEqual(applyPlainRepairs(old, repairs), plain)
  assert.throws(() => applyPlainRepairs({...plain, [repairs[0].id]:'后续人工白话修订'}, repairs), /停止覆盖/)
})
test('构建校验检测重复ID、换序重复题和派生索引不一致', () => {
  const q = sample()
  assert.ok(validateBank([q, q]).some(i => i.includes('ID 重复')))
  const duplicate = {...q, id: 'second', options: [q.options[2], q.options[0], q.options[1], q.options[3]], answer: 0}
  assert.ok(validateBank([q, duplicate]).some(i => i.includes('完全重复')))
  assert.deepEqual(validateBank([q, {...duplicate, q: '以下哪个数值最小？', answer: 1}]), [])
  const errors = validateBank([q], [], { chapters: { sample: '固定收益投资' }, calc: ['gone'], plain: { gone: '孤儿' } })
  assert.ok(errors.some(i => i.includes('章节索引')))
  assert.equal(errors.filter(i => i.includes('孤儿引用')).length, 2)
})
test('答案更正及无唯一解题隔离均留存旧记录；已迁移记录不重复清空', () => {
  for (const status of ['verified', 'pending']) {
    const q = {...sample(), contentRevision: 1, contentReview: { status, invalidatesPriorRecords: true, reason: '原题存在多个正确选项' }}
    assert.equal(isQuestionActive(q), status === 'verified')
    const r = { qid: q.id, contentRevision: 0, seen: 3, right: 1, wrong: 2, wrongFlag: true }
    const next = reconcileRecord(r, q)
    assert.equal(next.seen, 0)
    assert.equal(next.superseded[0].seen, 3)
    assert.equal(reconcileRecord(next, q), next)
    const e = { ids: [q.id], answers: { [q.id]: 0 }, questionRevisions: { [q.id]: 1 }, score: 0 }
    const reviewed = reconcileExam(e, () => q)
    if (status === 'pending') {
      assert.deepEqual(reviewed.ids, [])
      assert.equal(reviewed.score, null)
      assert.deepEqual(reviewed.superseded[0], {...e, superseded: undefined})
      assert.equal(reconcileExam(reviewed, () => q), reviewed)
    } else assert.equal(reviewed, e)
  }
})
