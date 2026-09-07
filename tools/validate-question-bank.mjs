import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
export function materialIssues(q) {
  const issues = []
  if (q.materialReview?.status === 'pending' || q.materialRequired && q.materialReview?.status !== 'verified') issues.push('依赖材料尚未核实')
  const reference = /如下[表图]|下表(?!述|达)|上表(?!述|达)|下图|上图|根据.{0,8}表格|根据.{0,8}材料|【材料题】|回答\d+[-—～至]\d+题/.test(q.q)
  if (reference && q.materialReview?.status !== 'verified') issues.push('存在表图或共用材料引用，须核对原件')
  if (q.materialReview?.status === 'verified' && (!q.materialReview.sourceFile || !q.materialReview.sourcePage || !q.q.startsWith('【题目材料】\n') || !q.q.includes('\n【问题】\n'))) issues.push('已核实材料缺少来源或完整题面')
  return issues
}
export function validateBank(bank, repairs) {
  const issues = bank.flatMap(q => materialIssues(q).map(reason => `${q.id}: ${reason}`))
  for (const f of repairs) {
    const q = bank.find(q => q.id === f.id)
    if (q?.q !== `【题目材料】\n${f.material}\n【问题】\n${f.question}` || q?.contentRevision !== f.revision || q?.materialReview?.invalidatesPriorRecords !== f.invalidatesPriorRecords) issues.push(`${f.id}: 已核实材料被覆盖，请运行 npm run repair:materials`)
  }
  return issues
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bank = JSON.parse(fs.readFileSync(new URL('../src/data/questions.json', import.meta.url)))
  const repairs = JSON.parse(fs.readFileSync(new URL('./question-material-repairs.json', import.meta.url)))
  const issues = validateBank(bank, repairs)
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1 }
  else console.log(`题面材料检查通过：${bank.length} 题，${repairs.length} 题有原件复核记录（规则检查不替代人工审题）`)
}
