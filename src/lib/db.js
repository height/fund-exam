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
  delete: (s, k) => request(s, 'readwrite', store => store.delete(k)),
  clear: (s) => request(s, 'readwrite', store => store.clear()),
}

export const kvGet = async (k, dflt) => ((await idb.get('kv', k)) || { v: dflt }).v
export const kvSet = (k, v) => idb.put('kv', { k, v })

// Reset only the active practice set, with its cursor in the same transaction.
export function clearPracticeRecords(ids, cursorKey) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['records', 'kv'], 'readwrite')
    for (const id of ids) tx.objectStore('records').delete(id)
    if (cursorKey) tx.objectStore('kv').put({ k: cursorKey, v: 0 })
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('清除记录失败'))
  })
}

// 合并笔记时更新目标与移除旧条目必须一起提交。
export function kvBatch(puts, deletes = []) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readwrite')
    const store = tx.objectStore('kv')
    for (const row of puts) store.put(row)
    for (const key of deletes) store.delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('笔记保存失败'))
  })
}
