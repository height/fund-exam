/* IndexedDB：做题记录 / 考试成绩 / 杂项 kv，全部只存在本机 */
const DB_NAME = 'fund-quiz'
const STORES = { records: 'qid', exams: 'id', kv: 'k' }

let db
export function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1)
    r.onupgradeneeded = e => {
      const d = e.target.result
      for (const [s, key] of Object.entries(STORES))
        if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: key })
    }
    r.onsuccess = e => { db = e.target.result; res(db) }
    r.onerror = () => rej(r.error)
  })
}

const tx = (store, mode = 'readonly') => db.transaction(store, mode).objectStore(store)

export const idb = {
  get: (s, k) => new Promise(r => { const q = tx(s).get(k); q.onsuccess = () => r(q.result) }),
  all: s => new Promise(r => { const q = tx(s).getAll(); q.onsuccess = () => r(q.result || []) }),
  put: (s, v) => new Promise(r => { const q = tx(s, 'readwrite').put(v); q.onsuccess = () => r() }),
  clear: s => new Promise(r => { const q = tx(s, 'readwrite').clear(); q.onsuccess = () => r() }),
}

export const kvGet = async (k, dflt) => ((await idb.get('kv', k)) || { v: dflt }).v
export const kvSet = (k, v) => idb.put('kv', { k, v })
