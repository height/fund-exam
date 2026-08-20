import { useEffect, useState } from 'react'
import { SUBJECTS, stats } from './lib/bank'
import { useStore } from './lib/store'
import Data from './views/Data'
import Exam from './views/Exam'
import Home from './views/Home'
import Practice from './views/Practice'
import Wrong from './views/Wrong'

const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches

const NAV = [
  { v: 'home', label: '首页', paths: ['M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'] },
  { v: 'practice', label: '练习', paths: ['M4 19.5 8 18l11-11a2.1 2.1 0 0 0-3-3L5 15z', 'M14 6l3 3'] },
  { v: 'exam', label: '模拟考', paths: ['M12 9v4l2.5 2M9 2h6'], circle: true },
  { v: 'wrong', label: '错题本', paths: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'] },
  { v: 'data', label: '数据', paths: ['M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3'] },
]

export default function App() {
  const { ready, records, toastMsg } = useStore()
  const [view, setView] = useState('home')
  const [params, setParams] = useState({})
  const [leaveGuard, setLeaveGuard] = useState(false)

  function go(v, p = {}) {
    if (leaveGuard && v !== view && !confirm('考试还在进行，离开会保留进度。确定离开？')) return
    setView(v)
    setParams(p)
    window.scrollTo(0, 0)
  }

  // 切页重置滚动，顺带用 key 强制重挂载，避免上一页的局部状态串台
  useEffect(() => { window.scrollTo(0, 0) }, [view])

  if (!ready) return null

  const wrongCount = SUBJECTS.reduce((a, s) => a + stats(records, s).wrong, 0)

  return (
    <>
      <div id="app" className={reduceMotion ? '' : 'fade'} key={`${view}:${params.scope || ''}`}>
        {view === 'home' && <Home go={go} />}
        {view === 'practice' && <Practice initialScope={params.scope} />}
        {view === 'exam' && <Exam go={go} setLeaveGuard={setLeaveGuard} />}
        {view === 'wrong' && <Wrong go={go} />}
        {view === 'data' && <Data />}
      </div>

      <nav>
        {NAV.map(({ v, label, paths, circle }) => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => go(v)}>
            <svg viewBox="0 0 24 24">
              {circle && <circle cx="12" cy="13" r="8" />}
              {paths.map(d => <path key={d} d={d} />)}
            </svg>
            {label}
            {v === 'wrong' && wrongCount > 0 && <span className="dot" />}
          </button>
        ))}
      </nav>

      <div className={`toast ${toastMsg ? 'on' : ''}`} role="status" aria-live="polite">{toastMsg}</div>
    </>
  )
}
