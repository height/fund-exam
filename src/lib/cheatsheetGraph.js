import { KNOWLEDGE } from '../data/knowledge.js'
import { indexKnowledge, ancestorsOf } from './knowledgeGraph.js'
import { notebookKnowledge } from './notebookKnowledge.js'

// A structural guide, not a source of new facts. Only matched branches are sent.
export function cheatsheetGraphContext(subject, notes) {
  const index = indexKnowledge(KNOWLEDGE[subject] || [])
  const matched = new Map()
  for (const note of notes) {
    let refs = notebookKnowledge({ ...note, subject, excerpt: note.title })
    if (!refs.length) refs = notebookKnowledge({ ...note, subject, excerpt: (note.markdown || '').replace(/<svg\b[\s\S]*?<\/svg>/gi, '').replace(/<[^>]+>/g, '').slice(0, 1200) })
    for (const ref of refs) {
      const entry = index.byId.get(ref.id)
      if (!entry) continue
      if (!matched.has(ref.id)) matched.set(ref.id, { id: ref.id, path: [...ancestorsOf(index, ref.id), ref.id].map(id => index.byId.get(id).t), sourceIds: [] })
      matched.get(ref.id).sourceIds.push(note.id)
    }
  }
  return index.entries.filter(e => matched.has(e.id)).map((entry, order) => ({ ...matched.get(entry.id), order }))
}
