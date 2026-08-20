/* 全局状态：做题记录、当前科目、主题、toast。所有写入同时落 IndexedDB */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { idb, kvGet, kvSet, openDB } from './db'

const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

export const THEMES = [['auto', '跟随系统'], ['light', '浅色'], ['dark', '深色']]


export function StoreProvider({ children }) {
  const [ready, setReady] = useState(false)
  const [records, setRecords] = useState({})
  const [subject, setSubjectState] = useState('科目一')
  const [autoNext, setAutoNextState] = useState(true)
  const [theme, setThemeState] = useState('auto')
  const [toastMsg, setToastMsg] = useState('')
  const [dialog, setDialog] = useState(null)
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme:dark)').matches)
  const toastTimer = useRef(0)
  const isDark = theme === 'dark' || (theme === 'auto' && systemDark)

  useEffect(() => {
    ;(async () => {
      await openDB()
      const rs = {}
      ;(await idb.all('records')).forEach(r => (rs[r.qid] = r))
      setRecords(rs)
      setSubjectState(await kvGet('subject', '科目一'))
      setAutoNextState(await kvGet('autoNext', true))
      setThemeState(await kvGet('theme', 'auto'))
      setReady(true)
    })()
  }, [])

  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme:dark)')
    const on = e => setSystemDark(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // 主题落到 <html data-theme>，跟随系统时删掉属性让 CSS 的 prefers-color-scheme 生效
  useEffect(() => {
    const r = document.documentElement
    if (theme === 'auto') delete r.dataset.theme
    else r.dataset.theme = theme
    document.querySelector('meta[name=theme-color]').content = isDark ? "#0B0D10" : "#F1F2F4"
  }, [theme, isDark])

  const toast = useCallback(m => {
    setToastMsg(m)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(''), 1700)
  }, [])

  /**
   * 应用内确认弹层，替掉原生 confirm/alert——装到主屏后系统弹窗会把 app 的壳撕开。
   * 返回 Promise<boolean>；不传 cancel 就是单按钮的提示框。
   */
  const ask = useCallback(opts => new Promise(resolve => {
    setDialog({ ...opts, resolve: v => { setDialog(null); resolve(v) } })
  }), [])

  const setSubject = useCallback(s => { setSubjectState(s); kvSet('subject', s) }, [])
  const setAutoNext = useCallback(v => { setAutoNextState(v); kvSet('autoNext', v) }, [])
  const setTheme = useCallback(t => { setThemeState(t); kvSet('theme', t) }, [])

  /** 记一次作答，返回是否答对。答对即移出错题本 */
  const recordAnswer = useCallback(async (q, pickedIdx) => {
    const ok = pickedIdx === q.answer
    setRecords(prev => {
      const old = prev[q.id] || { qid: q.id, subject: q.subject, seen: 0, right: 0, wrong: 0 }
      const r = {
        ...old,
        seen: old.seen + 1,
        right: old.right + (ok ? 1 : 0),
        wrong: old.wrong + (ok ? 0 : 1),
        wrongFlag: !ok,
        lastTs: Date.now(),
      }
      idb.put('records', r)
      return { ...prev, [q.id]: r }
    })
    return ok
  }, [])

  const patchRecord = useCallback((qid, patch) => {
    setRecords(prev => {
      if (!prev[qid]) return prev
      const r = { ...prev[qid], ...patch }
      idb.put('records', r)
      return { ...prev, [qid]: r }
    })
  }, [])

  const value = {
    ready, records, setRecords, subject, setSubject, autoNext, setAutoNext,
    theme, setTheme, isDark, toast, toastMsg, recordAnswer, patchRecord, ask, dialog,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
