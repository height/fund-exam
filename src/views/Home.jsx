import { useEffect, useState } from 'react'
import { SubjectSeg, ThemeToggle } from '../components/ui'
import { BANK, EXAM_MIN, EXAM_N, PASS, chapterStats, stats } from '../lib/bank'
import { idb } from '../lib/db'
import { useStore } from '../lib/store'

export default function Home({ go }) {
  const { records, subject } = useStore()
  const [exams, setExams] = useState([])

  useEffect(() => {
    idb.all('exams').then(all =>
      setExams(all.filter(e => e.subject === subject).sort((a, b) => b.id - a.id).slice(0, 4)))
  }, [subject])

  const st = stats(records, subject)
  const pct = Math.round((st.done / st.total) * 100)
  const chs = chapterStats(records, subject).filter(c => c.done)

  return (
    <>
      <div className="row between">
        <div><h1>基金从业刷题</h1></div>
        <div className="row" style={{ gap: 8 }}>
          <span className="chip">{BANK.length} 题</span>
          <ThemeToggle />
        </div>
      </div>
      <SubjectSeg />

      <div className="card">
        <div className="stats lead">
          <div className="stat">
            <b className={st.done ? '' : 'none'}>{st.done ? st.acc : '还没开始'}<i>{st.done ? '%' : ''}</i></b>
            <span>正确率</span>
          </div>
          <div className="stat"><b>{st.done}<i>/{st.total}</i></b><span>已做</span></div>
          <div className="stat">
            <b style={{ color: st.wrong ? 'var(--bad)' : 'inherit' }}>{st.wrong}</b>
            <span>错题待清</span>
          </div>
        </div>
        <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        <div className="muted">
          题库进度 {pct}%
          {st.done
            ? `　·　距离 ${EXAM_N} 题模拟考还差 ${Math.max(0, EXAM_N - st.done)} 题练手`
            : '　·　从练习模式开始'}
        </div>
      </div>

      <div className="grid2">
        <button className="btn-pri" style={{ padding: 16, textAlign: 'left' }} onClick={() => go('practice')}>
          练习模式
          <span style={{ display: 'block', fontWeight: 400, fontSize: 12, opacity: 0.8 }}>选完立刻出解析</span>
        </button>
        <button style={{ padding: 16, textAlign: 'left', borderColor: 'var(--accent)' }} onClick={() => go('exam')}>
          模拟考试
          <span style={{ display: 'block', fontWeight: 400, fontSize: 12, color: 'var(--ink2)' }}>
            {EXAM_MIN} 分钟 · {EXAM_N} 题
          </span>
        </button>
      </div>

      {chs.length > 0 && (
        <div className="card">
          <div className="row between"><h2>知识点掌握度</h2><span className="muted">弱项在前</span></div>
          <div className="stack">
            {chs.slice(0, 6).map(c => (
              <div className={`meter ${c.acc >= 80 ? '' : c.acc >= 60 ? 'mid' : 'weak'}`} key={c.chapter}>
                <span>{c.chapter}<span className="muted"> {c.done}/{c.total}</span></span>
                <b>{c.acc}%</b>
                <div className="bar"><i style={{ width: `${c.acc}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="row between">
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
      </div>
    </>
  )
}
