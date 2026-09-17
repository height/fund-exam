import assert from 'node:assert/strict'
import test from 'node:test'
import { KNOWLEDGE } from '../src/data/knowledge.js'
import { STUDY_PENS, studyNoteSpeech } from '../src/lib/studyNotes.js'
import { ancestorsOf, indexKnowledge, layoutKnowledge, searchKnowledge, toggleBranch, knowledgeNodeSize, chapterLabel } from '../src/lib/knowledgeGraph.js'

test('搜索覆盖新增三色笔记中的规则与例子', () => {
  const legal = indexKnowledge(KNOWLEDGE.科目一)
  assert.ok(searchKnowledge(legal, '2007年 基金公司会员部').some(p => p.t === '协会自律'))
  const investing = indexKnowledge(KNOWLEDGE.科目二)
  assert.ok(searchKnowledge(investing, 'S103').some(p => p.t === '期权分类与多空盈亏'))
  assert.deepEqual(searchKnowledge(investing, '连续三期 固定').map(p => p.t), ['指数跟踪与跟踪误差'])
})

test('笔记朗读完整覆盖内容，按必背、易错、速记排序且不读按钮', () => {
  assert.deepEqual(STUDY_PENS.map(p => p.key), ['core', 'trap', 'extra'])
  for (const chapters of Object.values(KNOWLEDGE)) {
    for (const point of chapters.flatMap(ch => ch.c.flatMap(sec => sec.c))) {
      const speech = studyNoteSpeech(point)
      assert.ok(speech.startsWith(point.t))
      assert.ok(speech.indexOf('易混易错') < speech.indexOf('理解速记'))
      assert.ok(speech.indexOf('核心必背') < speech.indexOf('易混易错'))
      for (const text of Object.values(point.review).flat()) assert.ok(speech.includes(text), point.t)
      assert.ok(speech.length < 2000, `${point.t}超过语音单次上限`)
      assert.doesNotMatch(speech, /上一考点|下一考点|专注阅读|只看必背/)
    }
  }
})

for (const [subject, chapters] of Object.entries(KNOWLEDGE)) {
  const index = indexKnowledge(chapters)
  test(`${subject}：全科脑图始终保留全部章节且考点可达，连线和布局不重叠`, () => {
    const visited = new Set()
    for (let i = 0; i < chapters.length; i++) {
      const open = new Set(index.entries.filter(n => n.chapterIndex === i && n.children.length).map(n => n.id))
      const { nodes, edges } = layoutKnowledge(index, i, open, subject)
      assert.equal(nodes.length, index.entries.filter(n => n.chapterIndex === i).length + chapters.length)
      const ids = new Set(nodes.map(n => n.id))
      for (const edge of edges) assert.ok(ids.has(edge.source) && ids.has(edge.target))
      assert.equal(edges.length, nodes.length - 1)
      nodes.filter(n => n.id !== 'subject').forEach(n => visited.add(n.id))
      assert.equal(nodes.filter(n => n.data.entry.depth === 1).length, chapters.length)
      const columns = Map.groupBy(nodes, n => n.position.x)
      for (const column of columns.values()) {
        column.sort((a, b) => a.position.y - b.position.y)
        column.slice(1).forEach((n, j) => assert.ok(n.position.y >= column[j].position.y + column[j].height))
      }
    }
    assert.equal(visited.size, index.entries.length)
  })
  test(`${subject}：总览严格保持新版章序和数量`, () => {
    const graph = layoutKnowledge(index, null, new Set(), subject)
    assert.deepEqual(graph.nodes.filter(n => n.data.entry.depth === 1).map(n => n.data.entry.chapter), chapters.map(ch => ch.chapter))
    assert.equal(graph.edges.length, chapters.length)
    assert.equal(graph.nodes[1].data.label, `一、${chapters[0].t}`)
    assert.equal(graph.nodes.filter(n => n.data.entry.depth === 1).at(-1).data.label, chapterLabel(index.chapters.at(-1)))
    const all = layoutKnowledge(index, null, new Set(index.entries.map(n => n.id)), subject)
    assert.equal(all.nodes.length, index.entries.length + 1)
    assert.equal(graph.nodes[0].data.entry.points, index.entries.filter(n => n.depth === 3).length)
  })
}

test('跨章搜索支持正文、多关键词和大小写，定位会展开完整祖先链', () => {
  const index = indexKnowledge(KNOWLEDGE.科目二)
  const matches = searchKnowledge(index, 'var 置信')
  assert.ok(matches.length > 0)
  assert.ok(matches.every(n => n.chapter === '投资风险管理'))
  const leaf = matches[0]
  const parents = ancestorsOf(index, leaf.id)
  assert.equal(parents.length, 2)
  const graph = layoutKnowledge(index, leaf.chapterIndex, new Set(parents), '科目二')
  assert.ok(graph.nodes.some(n => n.id === leaf.id))
  assert.deepEqual(searchKnowledge(index, '   '), [])
  assert.deepEqual(searchKnowledge(index, '不存在的考点123'), [])
})

test('收起分支仅移除本分支及子级展开状态', () => {
  const initial = new Set(['ch-1', 'ch-1.0', 'ch-10', 'ch-10.0'])
  assert.deepEqual([...toggleBranch(initial, 'ch-1')], ['ch-10', 'ch-10.0'])
  assert.equal(initial.size, 4)
})


test('节点矩形按标题宽度收紧，长标题换行且不裁切', () => {
  const short = knowledgeNodeSize({ t: '权益投资' })
  const long = knowledgeNodeSize({ t: '基金管理人的合规管理、风险管理和内部控制' })
  assert.ok(short.width < long.width)
  assert.equal(short.height, 40)
  assert.ok(long.height > short.height)
  assert.ok(long.width <= 250)
})
