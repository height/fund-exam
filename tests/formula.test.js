import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { COURSE_UNITS, DIMENSIONS, guidedQuestion, courseUnit } from '../src/data/formulaCourses.js'
import { returnModel, timeModel, discountModel, weightedModel, judgeQuestion, parseNumeric, calculate } from '../src/lib/formulaMath.js'
import { emptyProgress, formulaReducer, normalizeProgress, mergeProgress, evidenceFor, nextQuestion, REVIEW_DELAY } from '../src/lib/formulaProgress.js'

const unit = COURSE_UNITS[0]
const stamp = 100000
let serial = 0
function event(progress, q, type, input = '', at = stamp) {
  return formulaReducer(progress, { type: 'event', unitId: unit.id, at, event: { id: `test-${++serial}`, qid: q.id, type, input: String(input), at } })
}
function passAll(progress = emptyProgress(), phase = 'assessment', at = stamp) {
  for (const [i, d] of DIMENSIONS.entries()) {
    const q = nextQuestion(unit, progress, phase, d)
    progress = event(progress, q, 'answer', typeof q.answer === 'number' ? q.answer.toFixed(2) : q.answer, at + i)
  }
  return progress
}

test('financial quantities: principal, dividends, losses, zero interest and inverse time', () => {
  assert.equal(returnModel({ initial: 100, final: 90, income: 2 }).gain, -8)
  assert.equal(returnModel({ initial: 100, final: 90, income: 2 }).rate, -0.08)
  assert.throws(() => returnModel({ initial: 0, final: 10 }))
  const t = timeModel({ principal: 100, rate: 0.1, periods: 2 })
  assert.ok(Math.abs(t.final - 121) < 1e-9)
  assert.equal(t.rows[2].simple, 120)
  assert.ok(Math.abs(t.interest - 21) < 1e-9)
  assert.equal(timeModel({ principal: 100, rate: 0, periods: 3 }).final, 100)
  for (const rate of [0, 0.02, 0.1]) for (const periods of [0, 1, 3]) {
    const final = timeModel({ principal: 235, rate, periods }).final
    assert.ok(Math.abs(discountModel({ future: final, rate, periods }).present - 235) < 1e-9)
  }
  assert.throws(() => timeModel({ principal: 100, rate: 0.1, periods: 2.5 }))
})

test('weighted results and probability stay within bounds including losses and zero weights', () => {
  for (const w of [0, 0.2, 0.5, 1]) {
    const m = weightedModel({ weights: [w, 1 - w], rates: [-0.05, 0.2] })
    assert.ok(m.rate >= -0.05 && m.rate <= 0.2)
  }
  assert.throws(() => weightedModel({ weights: [0.4, 0.7], rates: [0.1, 0.2] }))
  assert.throws(() => weightedModel({ weights: [-0.1, 1.1], rates: [0.1, 0.2] }))
})

test('numeric input units and rounding are explicit', () => {
  assert.equal(parseNumeric('１２．５％', '%'), 12.5)
  assert.equal(parseNumeric('−4', '元'), -4)
  for (const input of ['', ' ', 'NaN', 'Infinity', '1e2', '10元', '1,000', '10%']) assert.equal(parseNumeric(input, '元'), null)
  const q = { answer: 8.125, unit: '%', digits: 2 }
  assert.equal(judgeQuestion(q, '8.13').correct, true)
  assert.equal(judgeQuestion(q, '0.0813').correct, false)
  assert.equal(judgeQuestion(q, '8.12').correct, false)
  assert.equal(judgeQuestion({ answer: -3.146, unit: '元' }, '-3.15').correct, true)
  assert.equal(judgeQuestion({ answer: 1.005, unit: '元' }, '1.01').correct, true)
  assert.equal(judgeQuestion({ answer: -1.005, unit: '元' }, '-1.01').correct, true)
})

test('every unit supplies all 18 disjoint assessment and review questions plus coherent guided answers', () => {
  const ids = new Set()
  for (const u of COURSE_UNITS) {
    assert.equal(u.questions.length, 18)
    for (const phase of ['assessment', 'review']) for (const d of DIMENSIONS) assert.equal(u.questions.filter(q => q.phase === phase && q.dimension === d).length, 3)
    for (const q of u.questions) {
      assert.ok(!ids.has(q.id)); ids.add(q.id)
      assert.ok(q.question && q.explanation && q.hint && q.source)
      if (q.options) { assert.equal(new Set(q.options).size, q.options.length); assert.ok(q.options.includes(q.answer)) }
      else {
        const m = calculate(u.kind, q.values)
        assert.ok(Math.abs(q.answer - m[q.field] * (q.unit === '%' ? 100 : 1)) < 1e-9)
        assert.equal(judgeQuestion(q, q.answer.toFixed(2)).correct, true)
      }
    }
    u.steps.forEach((_, i) => {
      const q = guidedQuestion(u, i)
      if (q) assert.equal(judgeQuestion(q, typeof q.answer === 'number' ? q.answer.toFixed(2) : q.answer).correct, true)
    })
  }
  assert.equal(ids.size, 108)
})

test('wrong then corrected, hints and revealed answers never count as independent', () => {
  for (const assisted of ['wrong', 'hint', 'reveal']) {
    let p = emptyProgress()
    const q = nextQuestion(unit, p, 'assessment', 'relation')
    p = event(p, q, assisted === 'wrong' ? 'answer' : assisted, assisted === 'wrong' ? q.options.find(o => o !== q.answer) : '')
    p = event(p, q, 'answer', q.answer, stamp + 1)
    assert.equal(evidenceFor(unit, p).passed.relation, undefined)
    assert.notEqual(nextQuestion(unit, p, 'assessment', 'relation').id, q.id)
  }
})

test('first-pass evidence, delayed review, and review failure require new independent evidence', () => {
  let p = passAll()
  const ready = evidenceFor(unit, p, stamp + 5)
  assert.equal(ready.status, '能独立完成')
  assert.equal(evidenceFor(unit, p, ready.dueAt - 1).status, '能独立完成')
  assert.equal(evidenceFor(unit, p, ready.dueAt).status, '待复习')
  let early = passAll(p, 'review', stamp + 10)
  assert.equal(evidenceFor(unit, early, ready.dueAt).status, '待复习')
  const completed = passAll(p, 'review', ready.dueAt)
  assert.equal(evidenceFor(unit, completed, ready.dueAt + 5).status, '已巩固')
  const q = nextQuestion(unit, p, 'review', 'relation')
  p = event(p, q, 'answer', q.options.find(o => o !== q.answer), ready.dueAt)
  assert.equal(evidenceFor(unit, p, ready.dueAt).status, '学习中')
  assert.equal(evidenceFor(unit, p).passed.relation, undefined)
  const retry = nextQuestion(unit, p, 'assessment', 'relation')
  p = event(p, retry, 'answer', retry.answer, ready.dueAt + 1)
  assert.equal(evidenceFor(unit, p, ready.dueAt + 2).status, '能独立完成')
  assert.equal(evidenceFor(unit, p).dueAt, ready.dueAt + 1 + REVIEW_DELAY)
})

test('exhaustion is finite and retries cannot manufacture evidence', () => {
  let p = emptyProgress()
  for (let i = 0; i < 3; i++) {
    const q = nextQuestion(unit, p, 'assessment', 'relation')
    p = event(p, q, 'hint', '', stamp + i)
  }
  assert.equal(nextQuestion(unit, p, 'assessment', 'relation'), null)
  assert.equal(evidenceFor(unit, p).passed.relation, undefined)
})

test('import deduplicates evidence, recomputes status and handles old/versioned/corrupt data', () => {
  const p = passAll()
  const once = mergeProgress(emptyProgress(), p)
  const twice = mergeProgress(once, p)
  assert.deepEqual(twice, once)
  assert.equal(twice.units[unit.id].events.length, 3)
  assert.equal(evidenceFor(unit, twice, stamp + 5).status, '能独立完成')
  assert.deepEqual(mergeProgress(p, null, true), emptyProgress())
  assert.deepEqual(mergeProgress(p, null), normalizeProgress(p))
  const corrupt = structuredClone(p)
  corrupt.units[unit.id].version = 999
  assert.deepEqual(normalizeProgress(corrupt), emptyProgress())
  const forged = structuredClone(p)
  forged.units[unit.id].events = [{ id: 'bad', qid: 'not-a-question', at: 5, type: 'answer', input: 'correct' }]
  assert.equal(normalizeProgress(forged).units[unit.id].events.length, 0)
})

test('same-millisecond hint order survives an export/import round trip', () => {
  const q = unit.questions[0]
  let p = event(emptyProgress(), q, 'hint')
  p = event(p, q, 'answer', q.answer)
  p = normalizeProgress(JSON.parse(JSON.stringify(p)))
  assert.equal(evidenceFor(unit, p).passed.relation, undefined)
})

test('explicit bank references exist in subject two and checked numerical keys agree', () => {
  const bank = JSON.parse(fs.readFileSync(new URL('../src/data/questions.json', import.meta.url)))
  for (const u of COURSE_UNITS) for (const id of u.bankIds) assert.equal(bank.find(q => q.id === id)?.subject, '科目二')
  const known = { '572e7cb191de': 10000 * 1.02 ** 5, be672a362e76: 10000 * 1.03 ** 3, f0c4d7b12698: 15, c73a08b0b9e5: 8.5, '80caed111002': 30 }
  for (const [id, answer] of Object.entries(known)) {
    const q = bank.find(q => q.id === id)
    const selected = parseFloat(q.options[q.answer].replace(/．/g, '.'))
    assert.ok(Math.abs(selected - answer) < (id === 'be672a362e76' ? 0.5 : 0.01), id)
  }
  assert.equal(courseUnit('compound').bankIds.includes('572e7cb191de'), true)
})
