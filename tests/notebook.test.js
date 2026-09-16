import test from 'node:test'
import assert from 'node:assert/strict'
import { parseNoteResult, groupNotes, validateNote, notePrompt, UNFILED, sameCapture, sameEssence, capturesOf } from '../src/lib/notebook.js'

const quote = '其他条件不变，市场利率上升时债券价格下降。'
const source = { subject: '科目二', chapter: '固定收益投资', chapterLocked: true, context: quote, evidenceContext: quote }
const result = { subject: '科目二', chapter: '固定收益投资', title: '债券价格与利率', points: [quote], evidence: [quote], needsReview: false }
const parse = (value, note = source) => parseNoteResult(JSON.stringify(value), note)
test('明确来源章节不被AI猜测覆盖；没有来源时未知章进入待核对', () => {
  assert.equal(parse({ ...result, chapter: '其他章' }).chapter, '固定收益投资')
  const unknown = parse({ ...result, chapter: '其他章' }, { ...source, chapterLocked: false })
  assert.equal(unknown.chapter, UNFILED); assert.equal(unknown.status, 'review')
})
test('用户选择的科目保持不变，AI只能在该科目内调整章节', () => {
  const manual = { ...source, subjectLocked: true, chapterLocked: false }
  const changed = parse({ ...result, subject: '科目一', chapter: '权益投资' }, manual)
  assert.equal(changed.subject, '科目二')
  assert.equal(changed.chapter, '权益投资')
  const outside = parse({ ...result, subject: '科目一', chapter: '基金职业道德规范' }, manual)
  assert.equal(outside.subject, '科目二')
  assert.equal(outside.chapter, UNFILED)
  assert.equal(outside.status, 'review')
})
test('复杂知识可以超过80字，不截断适用条件与推导', () => {
  const long = '这段规则适用于有明确范围的情形，必须先核对对象与适用条件。'.repeat(5)
  const got = parse({ ...result, points: [long], evidence: [long], detailReason: '需要保留适用条件' }, { ...source, evidenceContext: long })
  assert.equal(got.points[0], long); assert.equal(got.status, 'ready')
})
test('缺少、编造引用或新增规则数字进入待核对，不当成正式结论', () => {
  for (const patch of [{ evidence: [] }, { evidence: ['不存在的原文'] }, { points: ['利率上升5%，价格下降20%。'] }, { needsReview: true, reviewReason: '两个独立考点，请选择重点' }])
    assert.equal(parse({ ...result, ...patch }).status, 'review')
  assert.equal(parse({ ...result, points: [], evidence: [], needsReview: true }).status, 'review')
})
test('拒绝格式损坏，不伪装成短笔记', () => {
  for (const text of ['{"title":', '{}', JSON.stringify({ ...result, points: [null] })]) assert.throws(() => parseNoteResult(text, source))
})
test('图示关系只能引用存在的节点；模型提供的脚本不作为图执行', () => {
  const diagram = { kind: 'flow', title: '关系', nodes: [{ id: 'a', label: '利率上升', evidence: quote }, { id: 'b', label: '价格下降', evidence: quote }], edges: [{ from: 'a', to: 'b', label: '其他条件不变', evidence: quote }] }
  assert.equal(parse({ ...result, diagram }).status, 'ready')
  assert.equal(parse({ ...result, diagram: { ...diagram, edges: [{ from: 'a', to: 'missing', label: '' }] } }).status, 'review')
  assert.equal(parse({ ...result, diagram: '<svg onload="alert(1)"></svg>' }).diagram, null)
})
test('文字相同但公式不同不能自动归并；题库上下文修订后不能当重复', () => {
  const a = { ...source, ...result, status: 'ready' }
  assert.equal(sameEssence(a, a), true)
  assert.equal(sameEssence(a, { ...a, formula: { expression: 'A = B', condition: '', symbols: [] } }), false)
  assert.equal(sameCapture({ excerpt: '规则', sourceQid: 'q', context: '原版' }, { excerpt: '规则', sourceQid: 'q', context: '修订版' }), false)
})
test('旧笔记兼容，摘录时间可恢复，大纲按教材章序排序', () => {
  const note = { ...result, id: 'test-note', excerpt: '市场利率上升', context: quote, status: 'ready', createdAt: 1, updatedAt: 2 }
  assert.equal(validateNote(note), note); assert.equal(capturesOf(note)[0].at, 1)
  assert.throws(() => validateNote({ ...note, createdAt: NaN }))
  assert.throws(() => validateNote({ ...note, captures: [{ id: 'x', at: Infinity }] }))
  const groups = groupNotes([{ subject: '科目二', chapter: UNFILED }, { subject: '科目二', chapter: '固定收益投资' }, { subject: '科目二', chapter: '权益投资' }])
  assert.deepEqual(groups.map(g => g.chapter), ['权益投资', '固定收益投资', UNFILED])
})
test('提示词先判断表达形式，不要求绝对精简', () => {
  const prompt = notePrompt(source)
  assert.ok(prompt.includes('不是截断字数的硬限制') && prompt.includes('formula') && prompt.includes('diagram'))
  assert.ok(!prompt.includes('不超过80字'))
})

test('Markdown正文兼容、持久化校验与重复识别', () => {
  const md = '## 规则\n\n==重点==\n\n$$a=b$$'
  assert.equal(parse({ ...result, markdown: md }).markdown, md)
  assert.equal(parse(result).markdown, '')
  assert.equal(sameEssence({ ...source, ...result, status: 'ready', markdown: md }, { ...source, ...result, status: 'ready', markdown: '另一份正文' }), false)
  assert.throws(() => parse({ ...result, markdown: 'x'.repeat(60001) }))
})
