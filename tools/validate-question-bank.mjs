import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import { CHAPTERS } from '../src/data/chapters.js'
import { loadReviewRepairs, reviewRepairIssues, loadPlainRepairs, plainRepairIssues } from './apply-question-reviews.mjs'

// 只统一全半角、空白和末尾句号；保留小数点、负号、百分号及不等号。
export const normalizeText = text => text.normalize('NFKC').replace(/\s+/gu, '').replace(/[。]+$/u, '')
const hasText = value => typeof value === 'string' && value.trim().length > 0
const materialReference = /如下[表图]|下表(?!述|达)|上表(?!述|达)|下图|上图|如[图表]所示|(?:数据|分布|方案)如下[：:。]?(?:关于|以下|下列|根据这些)|根据.{0,8}表格|根据.{0,8}材料|[【（(]材料题[】）)]|回答\s*\d+\s*[-—～至–－]\s*\d+\s*题|^(?:（\d+）)?(?:在以上案例|本案例|针对本案例|关于该基金公司在本案例)/u
export function materialIssues(q) {
  const issues = []
  const stem = typeof q.q === 'string' ? q.q : ''
  if (q.materialReview?.status === 'pending' || q.materialRequired && q.materialReview?.status !== 'verified') issues.push('依赖材料尚未核实')
  if (materialReference.test(stem) && q.materialReview?.status !== 'verified') issues.push('存在表图或共用材料引用，须核对原件')
  if (q.materialReview?.status === 'verified' && (!q.materialReview.sourceFile || !Number.isInteger(q.materialReview.sourcePage) || q.materialReview.sourcePage < 1 || !stem.startsWith('【题目材料】\n') || !stem.includes('\n【问题】\n'))) issues.push('已核实材料缺少来源或完整题面')
  return issues
}
export function questionIssues(q) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return ['题目必须是对象']
  const issues = []
  if (q.contentReview?.status !== 'pending' && /【[^】]*过期[^】]*】/u.test(q.explain || '')) issues.push('活动题不得保留过期提示，须先复核内容或移出练习池')
  for (const field of ['id', 'q', 'explain', 'subject', 'chapter', 'source']) {
    if (!hasText(q[field])) issues.push(`${field} 缺失或为空`)
  }
  if (!CHAPTERS[q.subject]?.includes(q.chapter)) issues.push('科目与章节不匹配')
  if (!Array.isArray(q.options) || q.options.length !== 4 || !q.options.every(hasText)) issues.push('必须有四个非空选项')
  else if (new Set(q.options.map(normalizeText)).size !== 4) issues.push('存在重复选项')
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= (q.options?.length || 0)) issues.push('答案必须是有效的零基选项索引')
  const romanOnly = /^(?:VIII|VII|VI|IV|V|III|II|I)(?:[、,，\s]+(?:VIII|VII|VI|IV|V|III|II|I))*$/u
  if (q.contentReview?.status !== 'pending' && hasText(q.q) && Array.isArray(q.options) && q.options.length === 4 && q.options.every(o => hasText(o) && romanOnly.test(o.normalize('NFKC')))
    && !/[ⅠⅡⅢⅣⅤⅥⅦⅧ]|(?<![A-Za-z])(?:VIII|VII|VI|IV|V|III|II|I)(?![A-Za-z])/u.test(q.q)) issues.push('组合选项缺少题干对应陈述，须核对原件')
  if (hasText(q.explain) && /^(?:解析|答案|暂无解析|待补充|略)[：:。\s]*$/u.test(q.explain)) issues.push('解析仅为占位符')
  for (const [field, value] of [['q', q.q], ['explain', q.explain], ...(Array.isArray(q.options) ? q.options.map((o, i) => [`options[${i}]`, o]) : [])]) {
    if (typeof value !== 'string') continue
    if (/�|考证就上|扫码下载|复习资料包/u.test(value) || /[。！）]\d{1,2}\/\d{1,2}$/u.test(value)) issues.push(`${field} 含广告、乱码或页码残留`)
    if (field.startsWith('options') && /[【（(]材料题[】）)]|共\s*\d+\s*小题/u.test(value)) issues.push(`${field} 串入其他题目材料`)
  }
  if (q.contentRevision !== undefined && (!Number.isInteger(q.contentRevision) || q.contentRevision < 1)) issues.push('内容版本必须是正整数')
  if (q.contentReview) {
    if (!['verified', 'pending'].includes(q.contentReview.status) || !hasText(q.contentReview.reason)) issues.push('内容复核缺少状态或理由')
    if (q.contentReview.invalidatesPriorRecords && !q.contentRevision) issues.push('作废旧记录的修订必须带版本号')
    if (q.contentReview.status === 'pending' && !q.contentReview.invalidatesPriorRecords) issues.push('隔离题必须作废旧版计分')
  }
  return [...issues, ...materialIssues(q)]
}
export function validateBank(bank, repairs = [], indexes = {}) {
  if (!Array.isArray(bank) || !bank.length) return ['题库必须是非空数组']
  const issues = []
  const ids = new Map(), fingerprints = new Map()
  for (const q of bank) {
    const errors = questionIssues(q)
    issues.push(...errors.map(reason => `${q?.id || '未知ID'}: ${reason}`))
    if (!q || typeof q !== 'object') continue
    if (ids.has(q.id)) issues.push(`${q.id}: 题目 ID 重复`)
    ids.set(q.id, q)
    if (!errors.length) {
      const signature = JSON.stringify([q.subject, normalizeText(q.q), q.options.map(normalizeText).sort()])
      if (fingerprints.has(signature)) issues.push(`${q.id}: 与 ${fingerprints.get(signature)} 题干及选项完全重复，须人工合并并核对答案`)
      fingerprints.set(signature, q.id)
    }
  }
  for (const f of repairs) {
    const q = ids.get(f.id)
    if (q?.q !== `【题目材料】\n${f.material}\n【问题】\n${f.question}` || !Number.isInteger(q?.contentRevision) || q.contentRevision < f.revision || q?.materialReview?.invalidatesPriorRecords !== f.invalidatesPriorRecords || q?.materialReview?.sourceFile !== f.sourceFile || q?.materialReview?.sourcePage !== f.sourcePage) issues.push(`${f.id}: 已核实材料被覆盖，请运行 npm run repair:materials`)
  }
  for (const [name, index] of Object.entries(indexes)) {
    const keys = Array.isArray(index) ? index : Object.keys(index)
    if (new Set(keys).size !== keys.length) issues.push(`${name}: 索引包含重复 ID`)
    for (const id of keys) if (!ids.has(id)) issues.push(`${name}: 孤儿引用 ${id}`)
    if (name === 'chapters') for (const q of bank) if (q && index[q.id] !== q.chapter) issues.push(`${q.id}: 章节索引与题库不一致`)
  }
  return issues
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)))
  const bank = read('../src/data/questions.json')
  const repairs = read('./question-material-repairs.json')
  const plain = read('../src/data/plain.json')
  const issues = [...validateBank(bank, repairs, { chapters: read('./chapters.json'), plain, calc: read('../src/data/calc.json') }), ...reviewRepairIssues(bank, loadReviewRepairs()), ...plainRepairIssues(plain, loadPlainRepairs())]
  if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1 }
  else console.log(`题库检查通过：${bank.length} 题，${bank.filter(q => q.contentReview?.status === 'pending').length} 题隔离，${repairs.length} 题有原件材料复核（规则检查不替代人工审题）`)
}
