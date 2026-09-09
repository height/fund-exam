import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { KNOWLEDGE } from '../src/data/knowledge.js'
import { CHAPTERS, CHAPTER_DETAILS } from '../src/data/chapters.js'
import { buildLectureKnowledge } from '../tools/build-lecture-knowledge.mjs'
import { applyClassifications, classificationIssues } from '../tools/apply-lecture-classification.mjs'

const read = name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url)))
const taxonomy = read('../tools/taxonomy.json'), sources = read('../tools/lecture-sources.json')
const reviews = read('../tools/lecture-classification-review.json'), bank = read('../src/data/questions.json')

test('新教材26章与图谱、章节练习严格一一对应，每节均有内容', () => {
  assert.equal(CHAPTERS.科目一.length, 8)
  assert.equal(CHAPTERS.科目二.length, 18)
  assert.equal(CHAPTERS.科目二[2], '投资管理基础')
  assert.equal(CHAPTERS.科目二[17], '基金销售基础知识')
  for (const subject of Object.keys(CHAPTERS)) {
    assert.deepEqual(KNOWLEDGE[subject].map(n => n.chapter), CHAPTERS[subject])
    for (const chapter of KNOWLEDGE[subject]) {
      assert.deepEqual(chapter.c.map(n => n.t), CHAPTER_DETAILS[subject][chapter.chapter].sections)
      assert.ok(chapter.c.every(n => n.c.length > 0 && n.c.every(leaf => leaf.d && !leaf.source)))
    }
  }
})

test('跨章知识拆开后，风险、业绩、分配与销售各有正确章节', () => {
  const find = word => KNOWLEDGE.科目二.filter(ch => ch.c.some(sec => sec.c.some(n => n.t.includes(word)))).map(ch => ch.chapter)
  assert.deepEqual(find('VaR'), ['投资风险管理'])
  assert.deepEqual(find('风险调整收益'), ['基金业绩评价'])
  assert.deepEqual(find('货币基金收益权益'), ['基金的利润分配与税收'])
  assert.deepEqual(find('销售渠道与策略'), ['基金销售基础知识'])
})

test('拒绝旧章号、导学页与缺少考点的节', () => {
  assert.throws(() => buildLectureKnowledge(taxonomy, sources, '科目二|27.1|170|旧章|旧版章节'), /无效/)
  assert.throws(() => buildLectureKnowledge(taxonomy, sources, '科目二|1.1|2|旧目录|历史对照'), /无效/)
  assert.throws(() => buildLectureKnowledge(taxonomy, sources, ''), /缺少讲义考点/)
})

test('归类修订只改chapter，不作废原作答与材料复核，重复运行不改变结果', () => {
  const before = bank.map(q => ({ ...q, chapter: reviews.find(r => r.id === q.id)?.before || q.chapter }))
  const after = applyClassifications(before, reviews, taxonomy, sources)
  const original = new Map(before.map(q => [q.id, q]))
  for (const q of after) {
    const { chapter, ...content } = q
    const { chapter: oldChapter, ...prior } = original.get(q.id)
    assert.deepEqual(content, prior)
  }
  assert.equal(after.filter(q => q.chapter !== original.get(q.id).chapter).length, 27)
  assert.deepEqual(applyClassifications(after, reviews, taxonomy, sources), after)
  assert.deepEqual(classificationIssues(bank, reviews, taxonomy, sources), [])
})

test('复核脚本拒绝覆盖新归类或跨科目错误', () => {
  const q = bank.find(q => q.id === reviews[0].id)
  assert.throws(() => applyClassifications([{ ...q, chapter: '基金概述' }], [reviews[0]], taxonomy, sources), /停止覆盖/)
  assert.ok(classificationIssues(bank, [{ ...reviews[0], subject: '科目二' }], taxonomy, sources).length)
})
