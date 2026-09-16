import { kvGet, kvSet } from './db'

const KEY = 'notebook-cheatsheet:last'
export const cheatsheetFingerprint = notes => JSON.stringify(notes.filter(n => n.status === 'ready')
  .map(n => [n.id, n.updatedAt]).sort((a, b) => a[0].localeCompare(b[0])))

export async function loadCheatsheet() {
  const value = await kvGet(KEY, null)
  if (!value || value.version !== 1 || !Array.isArray(value.notes) || !value.notes.length ||
      !value.notes.every(n => typeof n.id === 'string' && typeof n.subject === 'string' && typeof n.chapter === 'string' &&
        typeof n.title === 'string' && typeof n.markdown === 'string' && Array.isArray(n.points))) return null
  return value
}

export async function saveCheatsheet(html, notes, sourceNotes) {
  const value = { version: 1, html, notes, createdAt: Date.now(), sourceCount: sourceNotes.length,
    fingerprint: cheatsheetFingerprint(sourceNotes) }
  await saveCheatsheetResult(value)
  return value
}

export async function saveCheatsheetResult(value) {
  await kvSet(KEY, value)
}
