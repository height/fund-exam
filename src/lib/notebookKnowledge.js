import { KNOWLEDGE } from '../data/knowledge.js'
import { indexKnowledge } from './knowledgeGraph.js'
import { distilledStudyText } from './studyNotes.js'

const normalize = text => String(text || '').normalize('NFKC').toLocaleLowerCase()
const grams = text => {
  const result = new Set()
  // Conjunctions are boundaries: “与利率” must not outrank the actual “债券” topic.
  for (const word of normalize(text).replace(/[与的及]/g, ' ').match(/[\p{Script=Han}]+|[a-z][a-z0-9]*/gu) || []) {
    if (/^[a-z]/.test(word)) result.add(word)
    else for (let size = 2; size <= 3; size++) for (let i = 0; i <= word.length - size; i++) result.add(word.slice(i, i + size))
  }
  return result
}
const ignored = new Set(['基金', '知识', '笔记', '内容', '整理', '科目', '章节', '帮我', '归类', '考点', '这个', '学习', '一下', '一点', '精简', '什么', '相关', '说明', '可以', '要求', '进行', '如何'])
const indexes = new Map()
function subjectIndex(subject) {
  if (indexes.has(subject)) return indexes.get(subject)
  const entries = indexKnowledge(KNOWLEDGE[subject] || []).entries.filter(n => !n.children.length).map(n => {
    const text = [...new Set([n.study ? distilledStudyText(n.study) : n.d, ...Object.values(n.review || {}).flat()].filter(Boolean))].join('\n')
    return { id: n.id, subject, chapter: n.chapter, title: n.t, text, titleTerms: grams(n.t), summaryTerms: grams(n.d), terms: grams(n.t + '\n' + text) }
  })
  const frequency = new Map()
  for (const entry of entries) for (const term of entry.terms) frequency.set(term, (frequency.get(term) || 0) + 1)
  const index = { entries, frequency }
  indexes.set(subject, index)
  return index
}

// Search only the chosen subject; current instructions and the selection outweigh surrounding context.
export function notebookKnowledge(note, messages = []) {
  const { entries, frequency } = subjectIndex(note.subject)
  const queries = [
    [messages.filter(m => m.role === 'user').at(-1)?.text, 3],
    [note.focus || note.selectionExcerpt || note.excerpt, 2],
    [note.title === '新笔记' ? '' : note.title, 2],
  ].filter(([text]) => text?.trim()).map(([text, weight]) => [grams(text.slice(0, 2000)), weight])
  if (!queries.length) return []
  return entries.map(entry => {
    let score = 0, matches = 0
    for (const [terms, weight] of queries) {
      let matched = 0, total = 0
      for (const term of terms) {
        if (ignored.has(term) || !frequency.has(term)) continue
        const importance = Math.log(1 + entries.length / (frequency.get(term) || 1))
        total += importance
        if (entry.terms.has(term)) { matched += importance * (entry.titleTerms.has(term) ? 2 : entry.summaryTerms.has(term) ? 1.4 : 1); matches++ }
      }
      score += weight * matched / Math.max(1, total)
    }
    return { entry, score, matches }
  }).filter(({ score, matches }) => score >= 0.65 && matches >= 1)
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id))
    .filter((item, i, ranked) => i < 4 && item.score >= ranked[0].score * 0.55)
    .map(({ entry: { id, subject, chapter, title, text } }) => ({ id, subject, chapter, title, text: text.slice(0, 1800) }))
}
