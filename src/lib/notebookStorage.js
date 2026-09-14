import { useEffect, useState } from 'react'
import { idb, kvGet, kvSet, kvBatch } from './db'
import { askNotebook, getKey } from './ai'
import { NOTE_PREFIX, validateNote, capturesOf, combineCaptures, sameCapture, sameEssence } from './notebook'

const jobs = new Map()
let writes = Promise.resolve()
const notify = () => window.dispatchEvent(new Event('notebook-changed'))
// 读改写串行化；支持 Web Locks 的浏览器也保护其他标签页的编辑。
function serial(work) {
  const next = writes.then(() => navigator.locks ? navigator.locks.request('notebook-write', work) : work())
  writes = next.catch(() => {})
  return next
}
const getNote = id => kvGet(NOTE_PREFIX + id, null)
async function writeNote(note) {
  validateNote(note)
  await kvSet(NOTE_PREFIX + note.id, note)
  notify()
  return note
}
export const noteRunning = id => jobs.has(id)
export async function loadNotes() {
  return (await idb.all('kv')).filter(row => row.k.startsWith(NOTE_PREFIX) && row.v)
    .map(row => validateNote(row.v)).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id))
}
export function saveNote(note, expectedAt) {
  return serial(async () => {
    const current = await getNote(note.id)
    if (jobs.has(note.id)) throw new Error('请等整理完成后再调整')
    if (expectedAt !== undefined && (!current || current.updatedAt !== expectedAt)) throw new Error('笔记刚有更新，请重新打开后调整')
    return writeNote(note)
  })
}
export function removeNote(id) {
  return serial(async () => {
    jobs.get(id)?.controller.abort()
    await idb.delete('kv', NOTE_PREFIX + id)
    notify()
  })
}
export function useNotebook() {
  const [state, setState] = useState({ notes: [], loading: true, error: '' })
  useEffect(() => {
    let alive = true, version = 0
    const refresh = async () => {
      const current = ++version
      try {
        const notes = await loadNotes()
        if (alive && current === version) setState({ notes, loading: false, error: '' })
      } catch (e) { if (alive && current === version) setState(s => ({ ...s, loading: false, error: e.message })) }
    }
    refresh()
    window.addEventListener('notebook-changed', refresh)
    window.addEventListener('focus', refresh)
    return () => { alive = false; window.removeEventListener('notebook-changed', refresh); window.removeEventListener('focus', refresh) }
  }, [])
  return state
}

export function captureToNotebook(draft) {
  return serial(async () => {
    const notes = await loadNotes()
    const capture = capturesOf(draft)[0]
    const existing = notes.find(n => n.subject === draft.subject && capturesOf(n).some(c => sameCapture(c, capture)))
    const note = existing ? { ...existing, captures: combineCaptures(existing, draft), updatedAt: Date.now() }
      : { ...draft, captures: [capture] }
    await writeNote(note)
    return { note, duplicate: !!existing, captureId: capture.id }
  })
}

export function undoCapture(captureId) {
  return serial(async () => {
    const note = (await loadNotes()).find(n => capturesOf(n).some(c => c.id === captureId))
    if (!note) return
    const captures = capturesOf(note).filter(c => c.id !== captureId)
    if (!captures.length) {
      jobs.get(note.id)?.controller.abort()
      await idb.delete('kv', NOTE_PREFIX + note.id)
      notify()
    } else await writeNote({ ...note, captures, updatedAt: Date.now() })
  })
}

export function organizeNote(note) {
  if (jobs.has(note.id)) return jobs.get(note.id).promise
  const controller = new AbortController()
  const promise = (async () => {
    const timer = setTimeout(() => controller.abort(new Error('整理超时，原文已保留，请重试')), 90000)
    try {
      const draft = await serial(async () => {
        const current = await getNote(note.id)
        if (!current || controller.signal.aborted) return null
        if (current.status === 'ready') throw new Error('已有精华请使用“对话编辑”，确认后才会替换')
        return writeNote({ ...current, status: 'pending', generationId: crypto.randomUUID(), error: '', updatedAt: Date.now() })
      })
      if (!draft) return null
      if (!getKey()) throw new Error('请先配置 AI，再回来重试；摘录已保留')
      const result = await askNotebook(draft, controller.signal)
      return await serial(async () => {
        const current = await getNote(note.id)
        if (!current || controller.signal.aborted) return null
        if (current.status !== 'pending' || current.generationId !== draft.generationId) return current
        const next = { ...current, ...result, updatedAt: Date.now() }
        const existing = result.status === 'ready' && (await loadNotes()).find(n => n.id !== note.id && sameEssence(n, next))
        if (!existing) return writeNote(next)
        // 只归并完全一致的正文；目标的人工编辑、标题和时间不被覆盖。
        const merged = { ...existing, captures: combineCaptures(existing, next), updatedAt: Date.now() }
        validateNote(merged)
        await kvBatch([{ k: NOTE_PREFIX + merged.id, v: merged }], [NOTE_PREFIX + note.id])
        notify()
        return merged
      })
    } catch (e) {
      // 撤销和删除不会被迟到的 AI 回包复活；异常只更新仍存在的摘录。
      await serial(async () => {
        const current = await getNote(note.id)
        if (current && current.status !== 'ready') await writeNote({ ...current, status: 'error', error: controller.signal.aborted ? controller.signal.reason?.message || '整理已中止，请重试' : e.message, updatedAt: Date.now() })
      })
      throw e
    } finally { clearTimeout(timer) }
  })()
  jobs.set(note.id, { promise, controller })
  notify()
  promise.finally(() => { jobs.delete(note.id); notify() }).catch(() => {})
  return promise
}

export function mergeNotes(source, target, changes) {
  return serial(async () => {
    const a = await getNote(source.id), b = await getNote(target.id)
    if (!a || !b || a.updatedAt !== source.updatedAt || b.updatedAt !== target.updatedAt || jobs.has(a.id) || jobs.has(b.id))
      throw new Error('笔记刚有更新，请重新打开合并')
    const merged = { ...b, ...changes, id: b.id, createdAt: b.createdAt, captures: combineCaptures(a, b), evidenceContext: [a.evidenceContext ?? a.context, b.evidenceContext ?? b.context].join('\n'), updatedAt: Date.now(), edited: true, status: changes.status || 'ready', reviewReason: changes.reviewReason || '' }
    validateNote(merged)
    await kvBatch([{ k: NOTE_PREFIX + b.id, v: merged }], [NOTE_PREFIX + a.id])
    notify()
    return merged
  })
}

export function notesFromBackup(data) {
  return (Array.isArray(data.kv) ? data.kv : []).filter(row => typeof row?.k === 'string' && row.k.startsWith(NOTE_PREFIX) && row.v)
    .map(row => {
      const note = validateNote(row.v)
      if (row.k !== NOTE_PREFIX + note.id) throw new Error('笔记索引与内容不一致')
      return note
    })
}
export function importNotes(notes) {
  return serial(async () => {
    if (jobs.size) throw new Error('有笔记正在整理，请完成后再导入')
    const puts = []
    for (const note of notes) {
      const old = await getNote(note.id)
      const next = old ? { ...(old.updatedAt >= note.updatedAt ? old : note), captures: combineCaptures(old, note) } : note
      validateNote(next)
      puts.push({ k: NOTE_PREFIX + next.id, v: next })
    }
    await kvBatch(puts)
    notify()
  })
}
