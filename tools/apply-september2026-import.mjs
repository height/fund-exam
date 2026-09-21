import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { normalizeText, questionIssues } from './validate-question-bank.mjs'

const fingerprint = q => JSON.stringify([q.subject, normalizeText(q.q), q.options.map(normalizeText).sort()])
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const content = q => ({ q: q.q, options: q.options, answer: q.answer })

// Similarity is only a review aid. Apply explicit editorial decisions, never a score threshold.
export function applySeptember2026Import(bank, chapters, calc, review) {
  const next = structuredClone(bank), mapping = { ...chapters }, calculations = [...calc]
  const byId = new Map(next.map(q => [q.id, q]))
  const signatures = new Map(next.map(q => [fingerprint(q), q.id]))
  for (const subject of ['科目一', '科目二']) {
    const numbers = review.questions.filter(r => r.subject === subject).map(r => r.sourceQuestionNo).sort((a, b) => a - b)
    if (!same(numbers, Array.from({ length: 100 }, (_, i) => i + 1))) throw new Error(`${subject}: 原题号须完整覆盖1—100且不重复`)
  }
  for (const row of review.questions) {
    if (!['add', 'duplicate', 'similar', 'reject'].includes(row.action) || !row.reason ||
        !Number.isInteger(row.sourcePage) || row.sourcePage < 1 ||
        !review.sources.some(s => s.subject === row.subject && s.file === row.sourceFile)) throw new Error('复核记录缺少有效处置或来源')
    if (row.action === 'reject' || row.action === 'similar') continue
    let q = byId.get(row.id)
    if (row.action === 'add') {
      const proposed = row.question
      const issues = questionIssues(proposed)
      if (proposed.id !== row.id || proposed.subject !== row.subject || proposed.source !== review.source || issues.length) throw new Error(`${row.id}: ${issues.join('；') || '新增题元数据不匹配'}`)
      if (q && !same({ ...q, sourceRefs: undefined }, { ...proposed, sourceRefs: undefined })) throw new Error(`${row.id}: 已存在的题目内容不同，停止覆盖`)
      if (!q) {
        if (signatures.has(fingerprint(proposed))) throw new Error(`${row.id}: 与${signatures.get(fingerprint(proposed))}重复`)
        q = structuredClone(proposed)
        next.push(q); byId.set(q.id, q); signatures.set(fingerprint(q), q.id)
      }
      mapping[q.id] = q.chapter
      if (row.calculation && !calculations.includes(q.id)) calculations.push(q.id)
    } else if (!q || q.subject !== row.subject || !same(content(q), row.target) || q.contentReview?.status === 'pending') {
      throw new Error(`${row.id}: 重复题目标内容变化或被隔离，须重新审题`)
    }
    const ref = { source: review.source, sourceFile: row.sourceFile, sourcePage: row.sourcePage, sourceQuestionNo: row.sourceQuestionNo }
    q.sourceRefs ??= []
    const existing = q.sourceRefs.find(r => r.sourceFile === ref.sourceFile && r.sourceQuestionNo === ref.sourceQuestionNo)
    if (existing && !same(existing, ref)) throw new Error(`${row.id}: 来源记录冲突`)
    if (!existing) q.sourceRefs.push(ref)
  }
  return { bank: next, chapters: mapping, calc: calculations }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)))
  const bank = read('../src/data/questions.json'), chapters = read('./chapters.json'), calc = read('../src/data/calc.json')
  const review = read('./september2026-import-review.json')
  const next = applySeptember2026Import(bank, chapters, calc, review)
  if (process.argv.includes('--check')) {
    if (!same(next, { bank, chapters, calc })) throw new Error('九月实战模拟题复核尚未应用')
  } else {
    fs.writeFileSync(new URL('../src/data/questions.json', import.meta.url), JSON.stringify(next.bank, null, 1))
    fs.writeFileSync(new URL('./chapters.json', import.meta.url), '{\n' + Object.entries(next.chapters).map(([id, chapter]) => `${JSON.stringify(id)}:${JSON.stringify(chapter)}`).join(',\n') + '\n}')
    fs.writeFileSync(new URL('../src/data/calc.json', import.meta.url), JSON.stringify(next.calc, null, 1))
  }
  console.log(`九月实战模拟题复核通过：${review.questions.length}条处置，新增${next.bank.length - bank.length}题，题库共${next.bank.length}题`)
}
