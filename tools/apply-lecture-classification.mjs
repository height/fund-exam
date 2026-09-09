import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)))
export function classificationIssues(bank, reviews, taxonomy, sources, checkApplied = true) {
  const byId = new Map(bank.map(q => [q.id, q]))
  const ids = new Set(), errors = []
  for (const r of reviews) {
    const q = byId.get(r.id)
    const [no, sec] = r.sectionId.split('.').map(Number)
    const ch = taxonomy[r.subject]?.find(c => c.no === no)
    if (ids.has(r.id)) errors.push(`${r.id}: 重复复核记录`)
    ids.add(r.id)
    if (!q || q.subject !== r.subject || !ch || ch.name !== r.after || ch.sections[sec - 1] !== r.section ||
      !taxonomy[r.subject].some(c => c.name === r.before) || !r.reason ||
      !['corrected', 'retained', 'pending'].includes(r.status) ||
      r.sourceFile !== sources[r.subject]?.file || !Array.isArray(r.pages) || !r.pages.length || r.pages.length > 2 ||
      r.pages.some(p => !Number.isInteger(p) || p < sources[r.subject].bodyStartPage || p > sources[r.subject].pageCount) ||
      r.pages.length === 2 && r.pages[0] > r.pages[1]) {
      errors.push(`${r.id}: 科目、章节、节或来源无效`)
      continue
    }
    if (r.status !== 'corrected' && r.before !== r.after) errors.push(`${r.id}: 保留或待复核题不能修改章节`)
    if (q.chapter !== r.after && (checkApplied || q.chapter !== r.before)) errors.push(`${r.id}: 章节与讲义复核记录不符，停止覆盖`)
  }
  return errors
}

export function applyClassifications(bank, reviews, taxonomy, sources) {
  const issues = classificationIssues(bank, reviews, taxonomy, sources, false)
  if (issues.length) throw new Error(issues.join('\n'))
  const byId = new Map(reviews.map(r => [r.id, r]))
  // 仅变更主章。题目ID、题面、答案、材料复核与内容版本均保持原值。
  return bank.map(q => byId.has(q.id) ? { ...q, chapter: byId.get(q.id).after } : q)
    .sort((a, b) => a.subject.localeCompare(b.subject, 'en') ||
      taxonomy[a.subject].find(c => c.name === a.chapter).no - taxonomy[b.subject].find(c => c.name === b.chapter).no ||
      (a.q < b.q ? -1 : a.q > b.q ? 1 : 0))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = '../src/data/questions.json'
  const bank = read(file), reviews = read('./lecture-classification-review.json')
  const taxonomy = read('./taxonomy.json'), sources = read('./lecture-sources.json')
  if (process.argv.includes('--check')) {
    const issues = classificationIssues(bank, reviews, taxonomy, sources)
    if (issues.length) throw new Error(issues.join('\n'))
  } else {
    const next = applyClassifications(bank, reviews, taxonomy, sources)
    const mapping = read('./chapters.json')
    for (const q of next) mapping[q.id] = q.chapter
    fs.writeFileSync(new URL(file, import.meta.url), JSON.stringify(next, null, 1))
    fs.writeFileSync(new URL('./chapters.json', import.meta.url), '{\n' + Object.entries(mapping).map(([id, ch]) => `${JSON.stringify(id)}:${JSON.stringify(ch)}`).join(',\n') + '\n}')
  }
  console.log(`讲义归类复核通过：${reviews.filter(r => r.status === 'corrected').length}题修订，${reviews.filter(r => r.status === 'pending').length}题待复核`)
}
