import { useEffect, useState } from 'react'
import Calculator from './components/Calculator'
import SelectionTip from './components/SelectionTip'
import { Dialog, Icon } from './components/ui'
import { track, trackPageview } from './lib/analytics'
import { SUBJECTS, stats } from './lib/bank'
import { useStore } from './lib/store'
import Chapters from './views/Chapters'
import Data from './views/Data'
import Exam from './views/Exam'
import Home from './views/Home'
import Formula from './views/Formula'
import KnowledgeMap from './views/KnowledgeMap'
import Numbers from './views/Numbers'
import Practice from './views/Practice'
import Timeline from './views/Timeline'
import Wrong from './views/Wrong'

const reduceMotion = matchMedia('(prefers-reduced-motion:reduce)').matches

const NAV = [
  { v: 'home', label: '首页', paths: ['M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'] },
  { v: 'practice', label: '练习', paths: ['M4 19.5 8 18l11-11a2.1 2.1 0 0 0-3-3L5 15z', 'M14 6l3 3'] },
  { v: 'exam', label: '模拟考', paths: ['M12 9v4l2.5 2M9 2h6'], circle: true },
  { v: 'wrong', label: '错题本', paths: ['M3 12a9 9 0 1 0 3-6.7L3 8', 'M3 3v5h5'] },
  { v: 'data', label: '设置', paths: ['M4 8h16', 'M15 6v4', 'M4 16h16', 'M8 14v4'] },
]

const VIEWS = ['home', 'practice', 'exam', 'wrong', 'data', 'map', 'numbers', 'formula', 'timeline', 'chapters']

// 路由就是 hash：#/practice?scope=all&order=seq。刷新回到原页，后退前进白送
function parseHash() {
  const [v, qs] = location.hash.replace(/^#\/?/, '').split('?')
  return {
    view: VIEWS.includes(v) ? v : 'home',
    params: Object.fromEntries(new URLSearchParams(qs)),
  }
}

export default function App() {
  const { ready, records, subject, toastMsg, ask } = useStore()
  const [calcOpen, setCalcOpen] = useState(false)
  const [{ view, params }, setNav] = useState(parseHash)
  // 答题中（练习进行、考试进行）：收起底栏，只留「退出」一个出口，
  // 免得手滑点到别的 tab 把一轮答题丢了
  const [quiz, setQuiz] = useState(false)
  // 时间线自己顶栏就带返回，底栏留着只是白占一截高度——按整页处理
  const bare = view === 'timeline'
  useEffect(() => {
    document.documentElement.toggleAttribute('data-quiz', quiz)
    return () => document.documentElement.removeAttribute('data-quiz')
  }, [quiz])
  useEffect(() => {
    document.documentElement.toggleAttribute('data-bare', bare)
    return () => document.documentElement.removeAttribute('data-bare')
  }, [bare])

  useEffect(() => {
    const on = () => setNav(parseHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // force：视图自己已经确认过了（比如考试页的「退出」），别再弹第二道
  async function go(v, p = {}, force = false) {
    if (!force && quiz && v !== view && !await ask({
      title: '答题还没结束',
      body: '离开会保留进度，回来能接着来。',
      ok: '确定离开', cancel: '继续答题',
    })) return
    const qs = new URLSearchParams(p).toString()
    const hash = `#/${v}${qs ? `?${qs}` : ''}`
    if (hash === location.hash) setNav({ view: v, params: p }) // 同址重进也要刷新状态
    else location.hash = hash // 状态更新交给 hashchange，后退键走的也是同一条路
    window.scrollTo(0, 0)
  }

  // 切页重置滚动，顺带用 key 强制重挂载，避免上一页的局部状态串台
  useEffect(() => {
    window.scrollTo(0, 0)
    trackPageview(view)
  }, [view])

  if (!ready) return null

  const wrongCount = SUBJECTS.reduce((a, s) => a + stats(records, s).wrong, 0)

  // 计算器挂在 App 而不是各视图里：从公式攻坚点「开练」会跳到 practice，
  // 挂在 Formula 里的话，正要算题的那一刻它反而没了。
  // 出现条件＝这页可能要算：公式攻坚本身、它带出来的计算题专练、以及科目二的做题页
  const needsCalc = view === 'formula'
    || (['practice', 'exam'].includes(view) && (subject === '科目二' || params.scope === 'calc'))

  return (
    <>
      <a className="skip" href="#app">跳到主要内容</a>
      <main id="app" className={reduceMotion ? '' : 'fade'} key={`${view}:${params.scope || ''}:${params.order || ''}`}>
        {view === 'home' && <Home go={go} />}
        {view === 'practice' && <Practice go={go} setQuiz={setQuiz} initialScope={params.scope} initialOrder={params.order} />}
        {view === 'exam' && <Exam go={go} setQuiz={setQuiz} chapter={params.ch}
          scope={params.scope} review={params.review} />}
        {view === 'wrong' && <Wrong go={go} />}
        {view === 'map' && <KnowledgeMap go={go} />}
        {view === 'numbers' && <Numbers go={go} initialMode={params.mode} review={params.review} />}
        {view === 'formula' && <Formula go={go} />}
        {view === 'timeline' && <Timeline go={go} />}
        {view === 'chapters' && <Chapters go={go} />}
        {view === 'data' && <Data />}
      </main>

      {!quiz && !bare && <nav>
        {NAV.map(({ v, label, paths, circle }) => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => go(v)}>
            <svg viewBox="0 0 24 24">
              {circle && <circle cx="12" cy="13" r="8" />}
              {paths.map(d => <path key={d} d={d} />)}
            </svg>
            {label}
            {v === 'wrong' && wrongCount > 0 && <span className="dot" aria-label={`${wrongCount} 道错题待清`} />}
          </button>
        ))}
      </nav>}

      {/* 抽屉展开时收起唤起钮，它本来就落在抽屉底下；收起用抽屉自己的 ×。
          Calculator 常驻挂载、只切 open，这样临时收起不会丢算式 */}
      {needsCalc && !calcOpen && (
        <button className="calc-fab" onClick={() => {
          track('feature_used', { feature: 'calculator' })
          setCalcOpen(true)
        }} aria-label="打开科学计算器">
          <Icon name="calc" />
        </button>
      )}
      {needsCalc && <Calculator open={calcOpen} onClose={() => setCalcOpen(false)} />}

      <Dialog />
      <SelectionTip go={go} />
      <div className={`toast ${toastMsg ? 'on' : ''}`} role="status" aria-live="polite">{toastMsg}</div>
    </>
  )
}
