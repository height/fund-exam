import { idb, kvGet, kvSet } from './db.js'

const LEGACY_KEY = 'notebook-cheatsheet:last'
const PREFIX = 'notebook-cheatsheet:subject:'
export const cheatsheetFingerprint = notes => JSON.stringify(notes.filter(n => n.status === 'ready')
  .map(n => [n.id, n.updatedAt]).sort((a, b) => a[0].localeCompare(b[0])))

function validResult(value) {
  return value?.version === 1 && Array.isArray(value.notes) && value.notes.length > 0 &&
    value.notes.every(n => typeof n.id === 'string' && typeof n.subject === 'string' && typeof n.chapter === 'string' &&
      typeof n.title === 'string' && typeof n.markdown === 'string' && Array.isArray(n.points) &&
      (n.section === undefined || typeof n.section === 'string') &&
      (n.reviewNotes === undefined || (Array.isArray(n.reviewNotes) && n.reviewNotes.every(r => typeof r === 'string'))))
}

// Keep the legacy document intact; subject-specific saves take precedence on future loads.
export async function loadCheatsheets() {
  const [legacy, rows] = await Promise.all([kvGet(LEGACY_KEY, null), idb.all('kv')])
  const results = {}
  if (validResult(legacy)) {
    const subjects = [...new Set(legacy.notes.map(n => n.subject))]
    for (const subject of subjects) {
      const notes = legacy.notes.filter(n => n.subject === subject)
      const sourceIds = new Set(notes.flatMap(n => n.sourceIds || []))
      let fingerprint = ''
      try { fingerprint = JSON.stringify(JSON.parse(legacy.fingerprint).filter(([id]) => sourceIds.has(id))) } catch { /* mark old sources stale */ }
      results[subject] = { ...legacy, subject, notes, html: undefined,
        sourceCount: subjects.length === 1 ? legacy.sourceCount : sourceIds.size,
        fingerprint: subjects.length === 1 ? legacy.fingerprint : fingerprint }
    }
  }
  for (const { k, v } of rows) {
    if (k.startsWith(PREFIX) && validResult(v) && v.subject === k.slice(PREFIX.length) &&
        v.notes.every(n => n.subject === v.subject)) results[v.subject] = v
  }
  return results
}

export async function saveCheatsheetResult(value) {
  if (!validResult(value) || !value.subject || !value.notes.every(n => n.subject === value.subject)) {
    throw new Error('每次只能保存一个科目的小抄')
  }
  await kvSet(`${PREFIX}${value.subject}`, value)
}
