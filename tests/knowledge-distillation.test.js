import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import katex from 'katex'
import { KNOWLEDGE } from '../src/data/knowledge.js'
import { KNOWLEDGE_PATHS, KNOWLEDGE_LINKS } from '../src/data/knowledgePaths.js'
import { distillLectureKnowledge } from '../tools/build-lecture-knowledge.mjs'

const leaves = Object.entries(KNOWLEDGE).flatMap(([subject, chapters]) => chapters.flatMap(ch => ch.c.flatMap(sec => sec.c.map(point => ({ subject, ...point })))))
const get = title => leaves.find(p => p.subject === '科目二' && p.t === title).study

test('170个叶子全部具备手工浓缩与真实页码定位，保留专业术语', () => {
  assert.equal(leaves.length, 170)
  assert.equal(leaves.filter(p => p.subject === '科目一').length, 66)
  for (const leaf of leaves) {
    const s = leaf.study
    for (const field of ['intuition', 'markdown', 'caution']) assert.ok(s[field]?.trim(), `${leaf.t}缺少${field}`)
    assert.match(s.evidence.pages, /^\d+(?:-\d+)?$/)
    assert.equal(s.evidence.file, `${leaf.subject}讲义.pdf`)
    assert.ok(!s.markdown.includes('^^'))
    assert.notEqual(s.intuition, s.markdown)
  }
  assert.match(get('随机变量与描述统计').markdown, /协方差/)
  assert.match(get('风险调整收益').markdown, /夏普.*特雷诺.*信息比率.*索提诺.*卡玛/)
})

test('主线覆盖每一章恰好一次，跨章关联均为可达的真实叶子', () => {
  for (const [subject, path] of Object.entries(KNOWLEDGE_PATHS)) {
    assert.deepEqual(path.groups.flatMap(g => g.chapters).sort((a, b) => a - b), KNOWLEDGE[subject].map((_, i) => i + 1))
    assert.equal(path.questions.length, KNOWLEDGE[subject].length)
  }
  for (const [key, targets] of Object.entries(KNOWLEDGE_LINKS)) {
    const [subject, title] = key.split('|')
    assert.ok(leaves.some(p => p.subject === subject && p.t === title))
    for (const target of targets) assert.ok(leaves.some(p => p.subject === subject && p.t === target), target)
  }
})

test('全部公式可渲染，每条附符号解释、成立条件和易错边界', () => {
  const formulaLeaves = leaves.filter(p => p.study.formula)
  assert.ok(formulaLeaves.length >= 20)
  for (const { t, study: s } of formulaLeaves) {
    assert.ok(s.symbols && s.caution, t)
    const formulas = [...s.formula.matchAll(/\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g)]
    assert.ok(formulas.length, t)
    for (const match of formulas) assert.doesNotThrow(() => katex.renderToString(match[1] || match[2], { throwOnError: true, strict: 'ignore', output: 'mathml' }), t)
  }
})

test('删冗余时保留会改变判断的条件与反例', () => {
  assert.match(get('随机变量与描述统计').caution, /不推出独立/)
  assert.match(get('风险调整收益').formula, /MAR/)
  assert.match(get('风险调整收益').caution, /不.*必然相等/)
  assert.match(get('期权分类与多空盈亏').example, /净亏2/)
  assert.match(get('主动比重与下行风险').condition, /先于或同时/)
  assert.match(get('均值方差与分散化').caution, /配对权重/)
  assert.match(get('绝对收益与加权方法').caution, /无解或多解/)
  assert.match(get('交易、申赎与巨额赎回').condition, /超过/)
  assert.match(get('费用承担与计提').condition, /366.*365/)
})

test('生成器拒绝缺漏、重复、无对应考点，且不修改输入', () => {
  const base = { 科目二: [{ c: [{ c: [{ t: '考点', d: '原摘要', review: { trap: ['边界'] } }] }] }] }
  const row = '科目二|考点|白话|**正式术语**', notes = '科目二|1.1|5-6|考点|原摘要'
  const sources = { 科目二: { file: '科目二讲义.pdf', edition: '用户讲义' } }
  const build = text => distillLectureKnowledge(base, text, notes, sources, {})
  assert.equal(build(row).科目二[0].c[0].c[0].study.markdown, '**正式术语**')
  assert.equal(base.科目二[0].c[0].c[0].study, undefined)
  assert.throws(() => build(''), /缺少浓缩笔记/)
  assert.throws(() => build(`${row}\n${row}`), /重复/)
  assert.throws(() => build(row.replace('考点', '未知')), /不存在/)
  assert.throws(() => build('科目二|考点||内容'), /字段不完整/)
})

test('完整阅读稿包含两科全部叶子、公式与来源', () => {
  const guide = fs.readFileSync(new URL('../docs/knowledge-map-study-guide.md', import.meta.url), 'utf8')
  assert.equal((guide.match(/^##### /gm) || []).length, 170)
  for (const leaf of leaves) assert.ok(guide.includes(`##### ${leaf.t}`))
  assert.ok(guide.includes(get('风险调整收益').formula))
})
