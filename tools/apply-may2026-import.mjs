import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { normalizeText, questionIssues } from './validate-question-bank.mjs'

const fingerprint = q => JSON.stringify([q.subject, normalizeText(q.q), q.options.map(normalizeText).sort()])

// 仅应用已逐题复核的清单；不以相似度自动增加、删除或覆盖题目。
export function applyMay2026Import(bank, chapters, review) {
  const next = structuredClone(bank)
  const mapping = { ...chapters }
  const byId = new Map(next.map(q => [q.id, q]))
  const signatures = new Map(next.map(q => [fingerprint(q), q.id]))
  for (const row of review.questions) {
    if (row.action === 'reject' || row.action === 'similar') continue
    let q = byId.get(row.id)
    if (row.action === 'add' && !q) {
      q = structuredClone(row.question)
      const issues = questionIssues(q)
      if (q.id !== row.id || q.subject !== row.subject || q.source !== review.source || issues.length) {
        throw new Error(`${row.id}: 无效新增题 ${issues.join('；')}`)
      }
      const duplicate = signatures.get(fingerprint(q))
      if (duplicate) throw new Error(`${row.id}: 与 ${duplicate} 重复，停止导入`)
      next.push(q)
      byId.set(q.id, q)
      signatures.set(fingerprint(q), q.id)
      mapping[q.id] = q.chapter
    }
    if (!q || q.subject !== row.subject) throw new Error(`${row.id}: 复核对应题不存在或科目不符`)
    // 重复题保留原ID、题面、答案、解析和修订版本，只补充来源关联。
    if (row.action === 'add' || row.linkSource) {
      const ref = {
        source: review.source, sourceFile: row.sourceFile,
        sourcePage: row.sourcePage, sourceQuestionNo: row.sourceQuestionNo,
        ...(row.answerPage ? { answerPage: row.answerPage } : {}),
      }
      q.sourceRefs ??= []
      if (!q.sourceRefs.some(r => r.sourceFile === ref.sourceFile && r.sourceQuestionNo === ref.sourceQuestionNo)) q.sourceRefs.push(ref)
    }
  }
  return { bank: next, chapters: mapping }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)))
  const bank = read('../src/data/questions.json'), chapters = read('./chapters.json')
  const next = applyMay2026Import(bank, chapters, read('./may2026-import-review.json'))
  if (process.argv.includes('--check')) {
    if (JSON.stringify(next.bank) !== JSON.stringify(bank) || JSON.stringify(next.chapters) !== JSON.stringify(chapters)) throw new Error('五月真题导入尚未应用')
  } else {
    fs.writeFileSync(new URL('../src/data/questions.json', import.meta.url), JSON.stringify(next.bank, null, 1))
    fs.writeFileSync(new URL('./chapters.json', import.meta.url), '{\n' + Object.entries(next.chapters).map(([id, chapter]) => `${JSON.stringify(id)}:${JSON.stringify(chapter)}`).join(',\n') + '\n}')
  }
  console.log(`五月真题复核：新增 ${next.bank.length - bank.length} 题，题库共 ${next.bank.length} 题`)
}
