import test from 'node:test'
import assert from 'node:assert/strict'
import { planPrompt, parsePlan, groupPrompt, parseGroup, generateOrganizedSheet } from '../src/lib/cheatsheetPlan.js'
import { cheatsheetBatches } from '../src/lib/cheatsheet.js'
import { cheatsheetGraphContext } from '../src/lib/cheatsheetGraph.js'
const note = (id, title = '最大回撤') => ({ id, title, status: 'ready', subject: '科目二', chapter: '投资风险管理', markdown: '峰在谷之前；保留时间顺序。', points: [] })
const batch = cheatsheetBatches([note('a'), note('b')])[0]
const plan = { groups: [{ title: '风险与业绩', topics: [{ title: '最大回撤', sourceIds: ['a', 'b'], requirements: ['峰必须先于谷', '衡量幅度'] }] }] }
const group = parsePlan(JSON.stringify(plan), batch)[0]
const result = () => ({ items: [{ topicId: 'g1t1', title: '最大回撤', sourceIds: ['a', 'b'], markdown: '最大回撤衡量跌幅，峰必须先于谷。', coverage: [0, 1], reviewNotes: [] }], figures: [] })

test('graph hints contain only matched subject branches in tree order, without importing facts', () => {
  const graph = cheatsheetGraphContext('科目二', [note('a')])
  assert.ok(graph.some(n => n.path.includes('主动比重与下行风险')))
  assert.ok(graph.every(n => n.sourceIds.includes('a') && n.path.length >= 2 && !('text' in n)))
  assert.deepEqual(cheatsheetGraphContext('科目二', [{ ...note('x', '量子纠缠'), markdown: '量子纠缠' }]), [])
  const data = JSON.parse(planPrompt(batch).split('\n').at(-1))
  assert.deepEqual(data.knowledgeStructure, cheatsheetGraphContext('科目二', batch.notes))
})
test('plan validates all sources, distinct topics and explicit knowledge requirements', () => {
  assert.equal(group.topics.length, 1)
  for (const topic of [
    { ...plan.groups[0].topics[0], sourceIds: ['a'] },
    { ...plan.groups[0].topics[0], sourceIds: ['a', 'unknown'] },
    { ...plan.groups[0].topics[0], requirements: [] },
  ]) assert.throws(() => parsePlan(JSON.stringify({ groups: [{ title: '组', topics: [topic] }] }), batch))
  assert.throws(() => parsePlan(JSON.stringify({ groups: [plan.groups[0], { ...plan.groups[0], title: '另组' }] }), batch), /重复/)
})
test('generation must account for each planned fact and separates review notes', () => {
  const data = result(); data.items[0].reviewNotes = ['口径需要核对']
  const got = parseGroup(JSON.stringify(data), batch, group)
  assert.equal(got[0].section, '风险与业绩')
  assert.deepEqual(got[0].reviewNotes, ['口径需要核对'])
  assert.ok(!got[0].markdown.includes('口径需要核对'))
  for (const patch of [{ coverage: [0] }, { coverage: [0, 2] }, { topicId: 'unknown' }, { sourceIds: ['a'] }]) {
    const bad = result(); Object.assign(bad.items[0], patch)
    assert.throws(() => parseGroup(JSON.stringify(bad), batch, group))
  }
})
test('multiple source diagrams may merge; disposition and new visual must agree', () => {
  const svg = label => `<svg viewBox="0 0 100 30"><text x="5" y="20">${label}</text></svg>`
  const b = cheatsheetBatches([{ ...note('a'), markdown: svg('峰') }, { ...note('b'), markdown: svg('谷') }])[0]
  const refs = JSON.parse(groupPrompt(b, group).split('\n').at(-1)).sourceFigures.map(f => f.ref)
  const data = result(); data.items[0].markdown += svg('峰→谷')
  data.figures = refs.map(ref => ({ ref, action: 'merge', topicId: 'g1t1', reason: '同一时间关系的互补节点' }))
  const got = parseGroup(JSON.stringify(data), b, group)[0]
  assert.equal((got.markdown.match(/<svg/g) || []).length, 1)
  assert.equal(got.figureDecisions.length, 2)
  data.items[0].markdown = '只有文字'
  assert.throws(() => parseGroup(JSON.stringify(data), b, group), /关系图缺失/)
  data.figures.pop()
  assert.throws(() => parseGroup(JSON.stringify(data), b, group), /去向不完整/)
})
test('pipeline plans once, follows logical order rather than input, and retains original attribution', async () => {
  const inputs = [note('risk', '风险'), note('base', '基础')]
  const stages = []
  const output = await generateOrganizedSheet(inputs, undefined, async (prompt, parse, label) => {
    stages.push(label)
    const data = JSON.parse(prompt.split('\n').at(-1))
    if (!data.plan) return parse(JSON.stringify({ groups: [
      { title: '基础', topics: [{ title: '基础概念', sourceIds: ['base'], requirements: ['概念'] }] },
      { title: '应用', topics: [{ title: '风险判断', sourceIds: ['risk'], requirements: ['条件'] }] },
    ] }))
    return parse(JSON.stringify({ items: data.plan.topics.map(t => ({ topicId: t.id, title: t.title, sourceIds: t.sourceIds, markdown: t.requirements.join('；'), coverage: [0], reviewNotes: [] })), figures: [] }))
  })
  assert.equal(stages.length, 3)
  assert.deepEqual(output.map(n => n.sourceIds[0]), ['base', 'risk'])
  assert.deepEqual(output.map(n => n.section), ['基础', '应用'])
  const controller = new AbortController(); controller.abort()
  await assert.rejects(() => generateOrganizedSheet(inputs, undefined, () => assert.fail('must not request'), controller.signal), /已取消/)
})

test('multi-batch extraction restores original IDs and carries review findings forward', async () => {
  const inputs = [note('a'), note('b')].map(n => ({ ...n, markdown: '资料'.repeat(16000) }))
  let calls = 0
  const output = await generateOrganizedSheet(inputs, undefined, async (prompt, parse) => {
    calls++
    const data = JSON.parse(prompt.split('\n').at(-1))
    if (data.plan) return parse(JSON.stringify({ items: data.plan.topics.map(t => ({ topicId: t.id, sourceIds: t.sourceIds, title: t.title, markdown: '按逻辑合并后的规则', coverage: [0], reviewNotes: [] })), figures: [] }))
    if ('knowledgeStructure' in data) return parse(JSON.stringify({ groups: [{ title: '共同主题', topics: [{ title: '合并考点', sourceIds: data.notes.map(n => n.id), requirements: ['两份来源的规则'] }] }] }))
    return parse(JSON.stringify({ items: [{ title: '来源核心知识', sourceIds: data.notes.map(n => n.id), markdown: '来源核心知识', reviewNotes: ['来源有冲突'] }] }))
  })
  assert.equal(calls, 4)
  assert.deepEqual(output[0].sourceIds, ['a', 'b'])
  assert.deepEqual(output[0].reviewNotes, ['来源有冲突'])
})

test('kept image references must be used exactly once in their declared topic', () => {
  const b = cheatsheetBatches([{ ...note('a'), markdown: '<svg viewBox="0 0 100 30"><text>峰</text></svg>' }, note('b')])[0]
  const ref = JSON.parse(groupPrompt(b, group).split('\n').at(-1)).sourceFigures[0].ref
  const data = result(); data.items[0].markdown += ref
  data.figures = [{ ref, action: 'keep', topicId: 'g1t1', reason: '关系图提供必要顺序' }]
  assert.ok(parseGroup(JSON.stringify(data), b, group)[0].markdown.includes('<svg'))
  data.items[0].markdown += ref
  assert.throws(() => parseGroup(JSON.stringify(data), b, group), /正文不一致/)
})

test('rich revision sheets reject omission of independent original diagrams', () => {
  const b = cheatsheetBatches([{ ...note('a'), markdown: '<svg viewBox="0 0 100 30"><text>峰</text></svg>' }, note('b')])[0]
  const prompt = groupPrompt(b, group)
  assert.ok(prompt.includes('有助理解的例题、代入计算与推导步骤优先保留'))
  const ref = JSON.parse(prompt.split('\n').at(-1)).sourceFigures[0].ref
  const data = result()
  data.figures = [{ ref, action: 'omit', topicId: 'g1t1', reason: '正文已经讲过' }]
  assert.throws(() => parseGroup(JSON.stringify(data), b, group), /独立原图不可省略/)
})
