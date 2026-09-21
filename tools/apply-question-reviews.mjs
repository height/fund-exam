import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
export function reviewTargets(repairs) {
  const targets = new Map()
  for (const fix of repairs) {
    if (!targets.has(fix.id)) targets.set(fix.id, new Map())
    for (const [field, value] of Object.entries(fix.after)) {
      const fields = targets.get(fix.id)
      const existing = fields.get(field)
      if (existing && !same(existing.value, fix.before[field])) throw new Error(`${fix.id}.${field}: 修订清单不连续，须人工合并`)
      fields.set(field, { value, accepted: [...(existing?.accepted || []), fix.before[field], value] })
    }
  }
  return targets
}
export function reviewRepairIssues(bank, repairs) {
  const byId = new Map(bank.map(q => [q.id, q]))
  const issues = []
  for (const [id, fields] of reviewTargets(repairs)) {
    const q = byId.get(id)
    for (const [field, target] of fields) if (!q || !same(q[field], target.value)) issues.push(`${id}.${field}: 已复核内容被覆盖，请核对后运行 npm run repair:questions`)
  }
  return issues
}
export function applyReviewRepairs(bank, repairs) {
  const next = structuredClone(bank)
  const byId = new Map(next.map(q => [q.id, q]))
  for (const [id, fields] of reviewTargets(repairs)) {
    const q = byId.get(id)
    if (!q) throw new Error(`${id}: 复核题不存在，停止修改`)
    for (const [field, target] of fields) {
      if (!target.accepted.some(value => same(q[field], value))) throw new Error(`${id}.${field}: 存在清单外的新改动，停止覆盖`)
      if (target.value === null) delete q[field]
      else q[field] = structuredClone(target.value)
    }
  }
  return next
}
export function loadReviewRepairs() {
  return ['question-cleanup-repairs.json', 'question-content-repairs.json', 'question-source-repairs.json', 'question-validity-repairs.json']
    .flatMap(name => JSON.parse(fs.readFileSync(new URL(name, import.meta.url))))
}
export const loadPlainRepairs = () => JSON.parse(fs.readFileSync(new URL('./question-plain-repairs.json', import.meta.url)))
export function plainRepairIssues(plain, repairs) {
  return repairs.filter(f => !same(plain[f.id], f.after)).map(f => `${f.id}: 白话解析与已复核版本不一致`)
}
export function applyPlainRepairs(plain, repairs) {
  const next = {...plain}
  for (const fix of repairs) {
    if (![fix.before, fix.after].some(value => same(next[fix.id], value))) throw new Error(`${fix.id}: 白话解析已有新改动，停止覆盖`)
    if (fix.after === null) delete next[fix.id]
    else next[fix.id] = fix.after
  }
  return next
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = new URL('../src/data/questions.json', import.meta.url)
  const next = applyReviewRepairs(JSON.parse(fs.readFileSync(file)), loadReviewRepairs())
  const plainFile = new URL('../src/data/plain.json', import.meta.url)
  const plain = applyPlainRepairs(JSON.parse(fs.readFileSync(plainFile)), loadPlainRepairs())
  fs.writeFileSync(file, JSON.stringify(next, null, 1))
  fs.writeFileSync(plainFile, JSON.stringify(plain))
  const indexFile = new URL('./chapters.json', import.meta.url)
  const index = JSON.parse(fs.readFileSync(indexFile))
  for (const q of next) index[q.id] = q.chapter
  fs.writeFileSync(indexFile, '{\n' + Object.entries(index).map(([id, chapter]) => `${JSON.stringify(id)}:${JSON.stringify(chapter)}`).join(',\n') + '\n}')
  console.log('题目内容复核补丁已应用；清单之外的新改动会拒绝覆盖')
}
