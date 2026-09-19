import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { TEACHING } from './lecture-teaching.mjs'
import { KNOWLEDGE_PATHS } from '../src/data/knowledgePaths.js'

const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8')
const subjects = ['科目一', '科目二']

export function buildLectureKnowledge(taxonomy, sources, notes) {
  const knowledge = Object.fromEntries(subjects.map(subject => [subject, taxonomy[subject].map(ch => ({
    t: ch.name,
    chapter: ch.name,
    c: ch.sections.map((t, i) => ({ t, section: `${ch.no}.${i + 1}`, c: [] })),
  }))]))
  for (const [i, line] of notes.split('\n').entries()) {
    if (!line.trim() || line.startsWith('#')) continue
    const fields = line.split('|')
    if (fields.length !== 5) throw new Error(`笔记第${i + 1}行应有5个字段`)
    const [subject, section, pageText, t, d] = fields
    const [chapterNo, sectionNo] = section.split('.').map(Number)
    const target = knowledge[subject]?.[chapterNo - 1]?.c[sectionNo - 1]
    const pages = pageText.split('-').map(Number)
    if (!target || target.section !== section || !t || !d || pages.length > 2 ||
      pages.some(p => !Number.isInteger(p) || p < sources[subject].bodyStartPage || p > sources[subject].pageCount) ||
      pages.length === 2 && pages[0] > pages[1]) throw new Error(`笔记第${i + 1}行章、节或页码无效`)
    if (target.c.some(n => n.t === t)) throw new Error(`笔记第${i + 1}行标题重复`)
    target.c.push({ t, d })
  }
  for (const subject of subjects) for (const chapter of knowledge[subject]) {
    for (const section of chapter.c) if (!section.c.length) throw new Error(`${subject}/${chapter.t}/${section.t}缺少讲义考点`)
  }
  return knowledge
}

export function lectureOutputs() {
  const taxonomy = JSON.parse(read('./taxonomy.json'))
  const sources = JSON.parse(read('./lecture-sources.json'))
  const notes = read('./lecture-notes.tsv')
  const knowledge = distillLectureKnowledge(enrichLectureKnowledge(buildLectureKnowledge(taxonomy, sources, notes), read('./lecture-sprint-notes.tsv')), read('./lecture-distilled.tsv'), notes, sources)
  const chapters = Object.fromEntries(subjects.map(s => [s, taxonomy[s].map(ch => ch.name)]))
  const details = Object.fromEntries(subjects.map(s => [s, Object.fromEntries(taxonomy[s].map(ch => [ch.name, {
    sections: ch.sections,
  }]))]))
  return {
    '../src/data/chapters.js': `/* 新版教材章序与节目录。由 tools/build-lecture-knowledge.mjs 生成。 */\nexport const CHAPTERS = ${JSON.stringify(chapters, null, 2)}\n\nexport const CHAPTER_DETAILS = ${JSON.stringify(details, null, 2)}\n`,
    '../src/data/knowledge.js': `/* 用户讲义整理。浓缩编辑：tools/lecture-distilled.tsv；公式与图解：tools/lecture-teaching.mjs。运行 npm run update:knowledge。 */\nexport const KNOWLEDGE = ${JSON.stringify(knowledge, null, 2)}\n`,
    '../docs/knowledge-map-study-guide.md': studyGuide(knowledge),
  }
}

function studyGuide(knowledge) {
  const lines = ['# 科目一、二 · 原理与浓缩知识图谱', '', '由讲义整理生成。阅读顺序：白话理解 → 核心判断 → 必要公式与条件 → 易错边界。沿用所提供讲义口径，不将讲义内容当作当前法规更新。', '', '应用直接展示浓缩要点，来源页码保留在本阅读稿中供核对；蓝色强调术语与结论、绿色标条件、红色标易错，正文保持中性色。复杂考点不以字数上限截断。', '']
  for (const [subject, chapters] of Object.entries(knowledge)) {
    const path = KNOWLEDGE_PATHS[subject]
    lines.push(`## ${subject}：${path.thesis}`, '', path.intro, '')
    for (const group of path.groups) lines.push(`- **${group.title}**（第${group.chapters.join('、')}章）：${group.question} ${group.mechanism}`)
    lines.push('')
    for (const [i, chapter] of chapters.entries()) {
      lines.push(`### 第${i + 1}章 ${chapter.t}`, '', `本章问题：${path.questions[i]}`, '')
      for (const section of chapter.c) {
        lines.push(`#### ${section.section} ${section.t}`, '')
        for (const point of section.c) {
          const s = point.study
          lines.push(`##### ${point.t}`, '', `先理解：${s.intuition}`, '', s.markdown, '')
          if (s.formula) lines.push(s.formula, '', `符号：${s.symbols}`, '')
          if (s.condition) lines.push(`条件：${s.condition}`, '')
          lines.push(`易错：${s.caution}`, '')
          if (s.example) lines.push(`验算：${s.example}`, '')
          lines.push(`来源：《${s.evidence.file}》PDF ${s.evidence.pages} 页。`, '')
        }
      }
    }
  }
  return `${lines.join('\n')}\n`
}

export function distillLectureKnowledge(knowledge, distilled, notes, sources, teaching = TEACHING) {
  const result = structuredClone(knowledge), points = new Map(), evidence = new Map(), seen = new Set()
  for (const [subject, chapters] of Object.entries(result)) for (const chapter of chapters) {
    for (const section of chapter.c) for (const point of section.c) points.set(`${subject}|${point.t}`, point)
  }
  for (const line of notes.split('\n').filter(line => line.trim() && !line.startsWith('#'))) {
    const [subject, section, pages, title] = line.split('|')
    evidence.set(`${subject}|${title}`, { file: sources[subject].file, pages, section, edition: sources[subject].edition })
  }
  for (const line of distilled.split('\n').filter(line => line.trim() && !line.startsWith('#'))) {
    const fields = line.split('|'), [subject, title, intuition, body] = fields, key = `${subject}|${title}`
    if (fields.length !== 4 || fields.some(value => !value.trim())) throw new Error(`浓缩笔记字段不完整：${key}`)
    if (!points.has(key) || seen.has(key)) throw new Error(`浓缩考点不存在或重复：${key}`)
    const point = points.get(key), supplement = teaching[key] || {}
    if (!evidence.has(key)) throw new Error(`浓缩考点缺少来源：${key}`)
    point.study = {
      intuition,
      markdown: body.split('^^').join('\n\n'),
      caution: supplement.caution || point.review.trap.join('\n'),
      ...supplement,
      evidence: evidence.get(key),
    }
    point.d = body.replaceAll('**', '').replaceAll('^^', ' ')
    seen.add(key)
  }
  for (const key of points.keys()) if (!seen.has(key)) throw new Error(`缺少浓缩笔记：${key}`)
  for (const key of Object.keys(teaching)) if (!points.has(key)) throw new Error(`公式或图解考点不存在：${key}`)
  return result
}

export function enrichLectureKnowledge(knowledge, notes) {
  const result = structuredClone(knowledge)
  const points = new Map()
  for (const [subject, chapters] of Object.entries(result)) {
    for (const chapter of chapters) for (const section of chapter.c) {
      for (const point of section.c) points.set(`${subject}|${point.t}`, point)
    }
  }
  const seen = new Set()
  for (const [i, line] of notes.split('\n').entries()) {
    if (!line.trim() || line.startsWith('#')) continue
    const fields = line.split('|')
    if (fields.length !== 5) throw new Error(`冲刺笔记第${i + 1}行应有5个字段`)
    const [subject, title, core, trap, extra] = fields
    const key = `${subject}|${title}`, point = points.get(key)
    if (!point || seen.has(key)) throw new Error(`冲刺笔记考点不存在或重复：${key}`)
    const split = text => text.split('^^').map(s => s.trim()).filter(Boolean)
    if (split(core).length < 2 || !trap.trim() || !extra.trim()) throw new Error(`冲刺笔记三色内容不完整：${key}`)
    point.review = {
      core: [...new Set([...point.d.split('。').filter(Boolean).map(s => `${s}。`), ...split(core)])],
      trap: split(trap), extra: split(extra),
    }
    seen.add(key)
  }
  for (const key of points.keys()) if (!seen.has(key)) throw new Error(`缺少冲刺笔记：${key}`)
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [path, content] of Object.entries(lectureOutputs())) {
    if (process.argv.includes('--check')) {
      if (read(path) !== content) throw new Error(`${path}不是最新生成结果，请运行 npm run update:knowledge`)
    } else fs.writeFileSync(new URL(path, import.meta.url), content)
  }
  console.log('讲义章、节、考点及来源校验通过')
}
