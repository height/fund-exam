// 全量扫描只生成候选，不能按相似度自动删题或宣称知识结论正确。
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { CHAPTERS } from '../src/data/chapters.js'
import { normalizeText, questionIssues } from './validate-question-bank.mjs'
const gram = text => {
  const normalized = normalizeText(text).replace(/[^\p{L}\p{N}%+=<>]/gu, '').toLowerCase()
  return new Set(Array.from({ length: Math.max(0, normalized.length - 1) }, (_, i) => normalized.slice(i, i + 2)))
}
function dice(a, b) {
  if (!a.size && !b.size) return 1
  let overlap = 0
  for (const value of a) if (b.has(value)) overlap++
  return 2 * overlap / (a.size + b.size)
}
export function auditBank(bank) {
  const vectors = bank.map(q => ({
    stem: gram(q.q.split('【问题】').at(-1)),
    options: gram(q.options.map(normalizeText).sort().join('|')),
    answer: gram(q.options[q.answer]),
  }))
  const candidates = []
  for (let i = 0; i < bank.length; i++) for (let j = 0; j < i; j++) {
    const stem = dice(vectors[i].stem, vectors[j].stem)
    if (stem < .45) continue
    const options = dice(vectors[i].options, vectors[j].options)
    const answer = dice(vectors[i].answer, vectors[j].answer)
    if (stem === 1 || stem >= .60 && options >= .40 || stem >= .45 && options >= .72 || stem >= .55 && answer >= .85) {
      candidates.push({ ids: [bank[j].id, bank[i].id], crossSubject: bank[i].subject !== bank[j].subject,
        stemSimilarity: +stem.toFixed(3), optionsSimilarity: +options.toFixed(3) })
    }
  }
  const pending = bank.filter(q => q.contentReview?.status === 'pending')
  return {
    scope: '全库结构、章节覆盖、题干与选项二元字符相似度；相似候选需逐对审读，不是完整语义去重或官方知识认证。',
    total: bank.length, active: bank.length - pending.length,
    pending: pending.map(q => ({ id: q.id, subject: q.subject, reason: q.contentReview.reason })),
    coverage: Object.entries(CHAPTERS).flatMap(([subject, chapters]) => chapters.map(chapter => {
      const qs = bank.filter(q => q.subject === subject && q.chapter === chapter)
      return { subject, chapter, total: qs.length, active: qs.filter(q => q.contentReview?.status !== 'pending').length }
    })),
    structuralIssues: bank.flatMap(q => questionIssues(q).map(reason => ({ id: q.id, reason }))),
    shortExplanations: bank.filter(q => q.explain.trim().length < 20).map(q => ({ id: q.id, explain: q.explain })),
    duplicateCandidates: candidates.sort((a, b) => b.stemSimilarity + b.optionsSimilarity - a.stemSimilarity - a.optionsSimilarity),
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bank = JSON.parse(fs.readFileSync(new URL('../src/data/questions.json', import.meta.url)))
  const report = auditBank(bank)
  const flag = process.argv.indexOf('--output')
  if (flag !== -1) {
    if (!process.argv[flag + 1]) throw new Error('--output 缺少文件路径')
    fs.writeFileSync(process.argv[flag + 1], JSON.stringify(report, null, 2) + '\n')
  }
  console.log(`全库 ${report.total} 题；可练习 ${report.active} 题；隔离 ${report.pending.length} 题；相似候选 ${report.duplicateCandidates.length} 对；结构问题 ${report.structuralIssues.length} 项`)
  if (flag === -1) console.log(JSON.stringify(report, null, 2))
}
