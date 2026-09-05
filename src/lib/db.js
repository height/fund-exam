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

// Resolve writes only after commit; request success alone can precede a quota/transaction failure.
function request(store, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode)
    const req = operation(transaction.objectStore(store))
    transaction.oncomplete = () => resolve(req.result)
    transaction.onerror = () => reject(transaction.error || req.error || new Error('本地存储失败'))
    transaction.onabort = () => reject(transaction.error || req.error || new Error('本地存储被中断'))
  })
}

export const idb = {
  get: (s, k) => request(s, 'readonly', store => store.get(k)),
  all: (s) => request(s, 'readonly', store => store.getAll()),
  put: (s, v) => request(s, 'readwrite', store => store.put(v)),
  clear: (s) => request(s, 'readwrite', store => store.clear()),
}

export const kvGet = async (k, dflt) => ((await idb.get('kv', k)) || { v: dflt }).v
export const kvSet = (k, v) => idb.put('kv', { k, v })
