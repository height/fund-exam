import fs from 'node:fs'
const path = new URL('../src/data/questions.json', import.meta.url)
const bank = JSON.parse(fs.readFileSync(path))
const repairs = JSON.parse(fs.readFileSync(new URL('./question-material-repairs.json', import.meta.url)))
for (const fix of repairs) {
  const q = bank.find(q => q.id === fix.id)
  const complete = `【题目材料】\n${fix.material}\n【问题】\n${fix.question}`
  if (!q || ![fix.original, complete].includes(q.q)) throw new Error(`题面已变化，须重新复核：${fix.id}`)
  q.q = complete
  q.contentRevision = fix.revision
  q.materialReview = { status: 'verified', sourceFile: fix.sourceFile, sourcePage: fix.sourcePage, invalidatesPriorRecords: fix.invalidatesPriorRecords }
}
fs.writeFileSync(path, JSON.stringify(bank, null, 1))
console.log(`已按原资料补全 ${repairs.length} 题，保留原题 ID、选项与答案`)
