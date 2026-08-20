import { useEffect, useState } from 'react'
import { SubjectSeg, ThemeToggle } from '../components/ui'
import { EXAM_MIN, EXAM_N, PASS, chapterStats, stats } from '../lib/bank'
import { idb } from '../lib/db'
import { useStore } from '../lib/store'

// 样本太少时正确率是噪声：做 2 题对 2 题不等于 100%。攒够这个数再把它当主指标
const MIN_SAMPLE = 10

/** 首页那句副文案：练手够了就别再念叨「还差 0 题」 */
function hint(st) {
  if (!st.done) return '从练习模式开始'
  const left = EXAM_N - st.done
  if (left > 0) return `距离 ${EXAM_N} 题模拟考还差 ${left} 题练手`
  return st.wrong ? `错题本还有 ${st.wrong} 道待清` : '练手量够了，去模拟考摸个底'
}

export default function Home({ go }) {
  const { records, subject } = useStore()
  const [exams, setExams] = useState([])

  useEffect(() => {
    idb.all('exams').then(all =>
      setExams(all.filter(e => e.subject === subject).sort((a, b) => b.id - a.id).slice(0, 4)))
  }, [subject])

  const st = stats(records, subject)
  const enough = st.done >= MIN_SAMPLE
  const pct = Math.round((st.done / st.total) * 100)
  // 一章只做过一两题就报「100% 掌握」是假精度，攒够 3 题才进这个榜
  const chs = chapterStats(records, subject).filter(c => c.done >= 3)

  return (
    <>
      <div className="row between">
        <h1>基金从业刷题</h1>
        <ThemeToggle />
      </div>
      <SubjectSeg />

      <div className="card">
        <div className="stats lead">
          <div className="stat">
            <b className={enough ? '' : 'none'}>
              {enough ? st.acc : st.done ? `再做 ${MIN_SAMPLE - st.done} 题` : '还没开始'}
              <i>{enough ? '%' : ''}</i>
            </b>
            <span>正确率</span>
          </div>
          <div className="stat"><b>{st.done}<i>/{st.total}</i></b><span>已做</span></div>
          <div className="stat">
            <b style={{ color: st.wrong ? 'var(--bad)' : 'inherit' }}>{st.wrong}</b>
            <span>错题待清</span>
          </div>
        </div>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="muted">题库进度 {pct}%　·　{hint(st)}</div>
      </div>

      <div className="grid2">
        <button className="btn-pri" style={{ padding: 16, textAlign: 'left' }} onClick={() => go('practice')}>
          练习模式
          <span style={{ display: 'block', fontWeight: 400, fontSize: 12, opacity: 0.8 }}>选完立刻出解析</span>
        </button>
        <button style={{ padding: 16, textAlign: 'left' }} onClick={() => go('exam')}>
          模拟考试
          <span style={{ display: 'block', fontWeight: 400, fontSize: 12, color: 'var(--ink2)' }}>
            {EXAM_MIN} 分钟 · {EXAM_N} 题
          </span>
        </button>
      </div>

      {chs.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>知识点掌握度</h2><span className="muted">弱项在前</span></div>
          <div className="stack">
            {chs.slice(0, 6).map(c => (
              <div className={`meter ${c.acc < PASS ? 'weak' : ''}`} key={c.chapter}>
                <span>{c.chapter}<span className="muted"> 做了 {c.done}/{c.total} 题</span></span>
                <b>{c.acc}%</b>
                <div className="bar"><i style={{ width: `${c.acc}%` }} /></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>最近模拟考</h2>
          {exams.length > 0 && <span className="muted">及格线 {PASS} 分</span>}
        </div>
        {exams.length ? (
          <div className="list">
            {exams.map(e => (
              <div className="list-item" key={e.id}>
                <span className={`score-chip ${e.score >= PASS ? 'pass' : 'fail'}`}>{e.score}</span>
                <span className="grow muted">答对 {e.right}/{e.total} · 用时 {Math.round(e.usedMs / 60000)} 分</span>
                <span className="muted num">
                  {new Date(e.ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <div><b>还没有考试记录</b>先做一套摸底，知道离 {PASS} 分还差多少。</div>
            <button className="btn-sm" onClick={() => go('exam')}>去考一套</button>
          </div>
        )}
      </section>
    </>
  )
}
