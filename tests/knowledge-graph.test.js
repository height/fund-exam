import assert from 'node:assert/strict'
import test from 'node:test'
import { KNOWLEDGE } from '../src/data/knowledge.js'
import { studyNoteSpeech, distilledStudyText } from '../src/lib/studyNotes.js'
import { ancestorsOf, indexKnowledge, layoutKnowledge, searchKnowledge, toggleBranch, knowledgeNodeSize, chapterLabel, branchViewport, knowledgeLabelLines } from '../src/lib/knowledgeGraph.js'

test('搜索覆盖新增三色笔记中的规则与例子', () => {
  const legal = indexKnowledge(KNOWLEDGE.科目一)
  assert.ok(searchKnowledge(legal, '2007年 基金公司会员部').some(p => p.t === '协会自律'))
  const investing = indexKnowledge(KNOWLEDGE.科目二)
  assert.ok(searchKnowledge(investing, 'S103').some(p => p.t === '期权分类与多空盈亏'))
  assert.deepEqual(searchKnowledge(investing, '连续三期 固定').map(p => p.t), ['指数跟踪与跟踪误差'])
})

test('朗读使用浓缩内容且覆盖公式条件，不自动重复折叠的讲义补充', () => {
  for (const chapters of Object.values(KNOWLEDGE)) {
    for (const point of chapters.flatMap(ch => ch.c.flatMap(sec => sec.c))) {
      const speech = studyNoteSpeech(point)
      assert.ok(speech.startsWith(point.t))
      assert.equal(speech, `${point.t}。\n${distilledStudyText(point.study)}`)
      assert.ok(speech.includes(point.study.caution))
      if (point.study.condition) assert.ok(speech.includes(point.study.condition))
      assert.ok(speech.length < 2000, `${point.t}超过语音单次上限`)
      assert.doesNotMatch(speech, /上一考点|下一考点|专注阅读|只看必背/)
    }
  }
})

test('搜索能够用新白话、公式符号和条件定位原考点', () => {
  const index = indexKnowledge(KNOWLEDGE.科目二)
  assert.ok(searchKnowledge(index, 'MAR 非零').some(n => n.t === '风险调整收益'))
  assert.ok(searchKnowledge(index, '照片 录像').some(n => n.t === '三张主要财务报表'))
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
  assert.equal(short.height, 34)
  assert.ok(long.height > short.height)
  assert.ok(long.width <= 250)
})

test('移动脑图向右展开，节点保留完整点击区域和子树折叠状态', () => {
  const index = indexKnowledge(KNOWLEDGE.科目二)
  const open = new Set(['ch-0', 'ch-0.0', 'ch-1'])
  const graph = layoutKnowledge(index, 0, open, '科目二', true)
  assert.equal(graph.nodes.filter(n => n.data.entry.depth === 1).length, 18)
  assert.ok(graph.nodes.every(n => !n.data.left && n.width <= 164 && n.height >= 44))
  const collapsed = toggleBranch(open, 'ch-0')
  assert.deepEqual([...collapsed], ['ch-1'])
  const reopened = toggleBranch(collapsed, 'ch-0')
  assert.ok(!reopened.has('ch-0.0'))
})

test('长标题按整字换行计算高度，与实际呈现使用同样的行', () => {
  const title = '私募证券投资基金的募集、备案及份额申赎'
  const size = knowledgeNodeSize({ t: title, branch: true }, true)
  const lines = knowledgeLabelLines(title, size.width, true)
  assert.equal(lines.join(''), title)
  assert.equal(lines.length, 3)
  assert.equal(size.height, 66)
  for (const [subject, chapters] of Object.entries(KNOWLEDGE)) {
    const index = indexKnowledge(chapters)
    const graph = layoutKnowledge(index, null, new Set(index.entries.map(n => n.id)), subject, true)
    for (const node of graph.nodes) {
      assert.equal(node.data.lines.join(''), node.data.label)
      assert.ok(node.height >= node.data.lines.length * 18 + 12)
    }
  }
})

test('展开保持可读缩放、桌面点击锚点，并将移动端子节点移入可见区域', () => {
  const target = { position: { x: 900, y: 800 }, width: 160, height: 48, data: { left: false } }
  const desktop = branchViewport(target, { x: 400, y: 300 }, { zoom: 1.2 }, 1200, 800)
  assert.equal(desktop.zoom, 1.2)
  assert.equal(desktop.x + (900 + 80) * desktop.zoom, 400)
  assert.equal(desktop.y + (800 + 24) * desktop.zoom, 300)
  const children = [{ position: { x: 1078, y: 720 }, width: 164, height: 48 }, { position: { x: 1078, y: 880 }, width: 164, height: 48 }]
  const mobile = branchViewport(target, { x: 100, y: 24 }, { zoom: .3 }, 390, 600, children)
  assert.equal(mobile.zoom, 1)
  for (const node of [target, ...children]) {
    assert.ok(node.position.x * mobile.zoom + mobile.x >= 0)
    assert.ok((node.position.x + node.width) * mobile.zoom + mobile.x <= 390)
    assert.ok(node.position.y * mobile.zoom + mobile.y >= 0)
    assert.ok((node.position.y + node.height) * mobile.zoom + mobile.y <= 600)
  }
})
