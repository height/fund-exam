import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

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
  const knowledge = enrichLectureKnowledge(buildLectureKnowledge(taxonomy, sources, read('./lecture-notes.tsv')), read('./lecture-sprint-notes.tsv'))
  const chapters = Object.fromEntries(subjects.map(s => [s, taxonomy[s].map(ch => ch.name)]))
  const details = Object.fromEntries(subjects.map(s => [s, Object.fromEntries(taxonomy[s].map(ch => [ch.name, {
    sections: ch.sections,
  }]))]))
  return {
    '../src/data/chapters.js': `/* 新版教材章序与节目录。由 tools/build-lecture-knowledge.mjs 生成。 */\nexport const CHAPTERS = ${JSON.stringify(chapters, null, 2)}\n\nexport const CHAPTER_DETAILS = ${JSON.stringify(details, null, 2)}\n`,
    '../src/data/knowledge.js': `/* 用户讲义整理：章 → 节 → 考点。编辑 tools/lecture-notes.tsv 与 tools/lecture-sprint-notes.tsv 后重新生成。 */\nexport const KNOWLEDGE = ${JSON.stringify(knowledge, null, 2)}\n`,
  }
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
