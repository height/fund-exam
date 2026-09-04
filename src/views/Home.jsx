import { useEffect, useState } from 'react'
import { Icon, SubjectSeg, ThemeToggle } from '../components/ui'
import { BANK, EXAM_MIN, EXAM_N, PASS, bySubject, chapterStats, effort, getRandomN, stats } from '../lib/bank'
import { TL_N } from '../data/timeline'
import { idb } from '../lib/db'
import { numberQuestions } from '../lib/numbers'
import { useStore } from '../lib/store'

// 样本太少时正确率是噪声：做 2 题对 2 题不等于 100%。攒够这个数再把它当主指标
const MIN_SAMPLE = 10

const day = iso => new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

/**
 * 及格线刻度：这门考试 100 题答对 60 题及格，所以正确率和 60% 画在同一条尺上。
 * 刻度贴到右边时标签会溢出容器，翻到线的左侧去。
 */
function Gauge({ value, mini }) {
  const under = value < PASS
  return (
    <div className={`gauge ${mini ? 'mini' : ''} ${under ? 'under' : ''}`} style={{ '--at': `${PASS}%` }}>
      <div className="gauge-track"><i style={{ width: `${Math.min(100, value)}%` }} /></div>
      <span className={`gauge-tick ${PASS > 82 ? 'flip' : ''}`} data-at={`${PASS}%`} />
    </div>
  )
}

export default function Home({ go }) {
  const { records, subject } = useStore()
  const [exams, setExams] = useState([])

  useEffect(() => {
    idb.all('exams').then(all =>
      setExams(all.filter(e => e.subject === subject && e.kind !== 'numbers').sort((a, b) => b.id - a.id).slice(0, 3)))
  }, [subject])

  const st = stats(records, subject)
  const enough = st.done >= MIN_SAMPLE
  // 一章只做过一两题就报「100% 掌握」是假精度，攒够 3 题才进这个榜
  const chs = chapterStats(records, subject).filter(c => c.done >= 3)
  const total = bySubject(subject).length
  const last = exams[0]
  const ef = effort(records)
  const randN = getRandomN()
  // 章节列表按教材序，这里只取章数给副标题用
  const chs2 = chapterStats(records, subject, true)
  const numberN = numberQuestions(subject).length

  return (
    <>
      <header className="appbar">
        <SubjectSeg />
        <ThemeToggle />
      </header>

      <div className="card">
        <div className="hero-top">
          {enough ? (
            <>
              <b className="hero-num">{st.acc}<i>%</i></b>
              <div className={`hero-verdict ${st.acc < PASS ? 'under' : ''}`}>
                <b>{st.acc < PASS ? `离及格差 ${PASS - st.acc} 个点` : `高出及格线 ${st.acc - PASS} 个点`}</b>
                <span className="muted">练习正确率 · 基于 {st.done} 题</span>
              </div>
            </>
          ) : (
            <div className="hero-verdict">
              <b className="hero-num flat">{st.done ? `再做 ${MIN_SAMPLE - st.done} 题就能看出水平` : '还没开始'}</b>
              <span className="muted">答满 {MIN_SAMPLE} 题才算得准</span>
            </div>
          )}
        </div>

        <Gauge value={enough ? st.acc : 0} />

        <div className="hero-foot">
          <span>已做<b>{st.done}<i>/{total}</i></b></span>
          <span>错题待清<b style={st.wrong ? { color: 'var(--bad)' } : null}>{st.wrong}</b></span>
          <span>最近模拟考<b>{last ? last.score : '未考'}</b></span>
        </div>
      </div>

      <div className="today">
        <span>今日练习<b>{ef.today}</b>题</span>
        <span>累计作答<b>{ef.answers}</b>次，覆盖<b>{ef.covered}</b>题</span>
      </div>

      {/* 两个刷题入口并排：左边接着上次，右边打乱来一小轮 */}
      <div className="grid2 go-pair">
        <button className="go go-seq" onClick={() => go('chapters')}>
          <Icon name="list" />
          <b>章节练习</b>
          <small>{chs2.length} 章 · 按教材目录练或考</small>
        </button>
        <button className="go go-rand" onClick={() => go('practice', { scope: 'all', order: 'rand' })}>
          <Icon name="dice" />
          <b>随机 {randN} 题</b>
          <small>打乱抽一小轮</small>
        </button>
      </div>

      <div className="grid2">
        <button className="tile" onClick={() => go('exam')}>
          <b><Icon name="exam" /> 模拟考试</b>
          <small>{EXAM_MIN} 分钟 · {EXAM_N} 题</small>
        </button>
        <button className="tile" onClick={() => go('wrong')}>
          <b><Icon name="wrong" /> 错题本</b>
          {st.wrong
            ? <small><span className="n">{st.wrong}</span> 道待消灭</small>
            : <small>暂时是空的</small>}
        </button>
        <button className="tile" onClick={() => go('formula')}>
          <b><Icon name="calc" /> 公式攻坚</b>
          <small>47 组公式，逐字符讲解和练题</small>
        </button>
        <button className="tile" onClick={() => go('timeline')}>
          <b><Icon name="timeline" /> 发展时间线</b>
          <small>{TL_N.total} 个时点 · 默认看重点</small>
        </button>
        <button className="tile" onClick={() => go('map')}>
          <b><Icon name="map" /> 知识图谱</b>
          <small>章节 → 主题 → 必背要点</small>
        </button>
        <button className="tile" onClick={() => go('numbers')}>
          <b><Icon name="numbers" /> 数字必背</b>
          <small>{numberN} 张题卡 · 背完模拟练</small>
        </button>
      </div>

      {chs.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>知识点掌握度</h2><span className="muted">弱项在前</span></div>
          <div className="stack">
            {chs.slice(0, 6).map(c => (
              <div className="meter" key={c.chapter}>
                <span>{c.chapter}<span className="muted"> 做了 {c.done}/{c.total} 题</span></span>
                <b className={c.acc < PASS ? 'under' : ''}>{c.acc}%</b>
                <Gauge value={c.acc} mini />
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

      <footer className="colophon">
        <span>应用更新　<b>{day(__BUILD_TIME__)}</b></span>
        <span>题库更新　<b>{day(__BANK_TIME__)}</b>　共 <b>{BANK.length}</b> 题</span>
      </footer>
    </>
  )
}
