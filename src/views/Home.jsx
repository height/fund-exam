import { useEffect, useState } from 'react'
import { Icon, PageHeader, SubjectSeg, ThemeToggle } from '../components/ui'
import { BANK, PASS, bySubject, chapterStats, effort, getRandomN, stats } from '../lib/bank'
import { idb } from '../lib/db'
import { numberQuestions } from '../lib/numbers'
import { useStore } from '../lib/store'
import { examCountdownDays } from '../lib/examCountdown'
import { useNotebook } from '../lib/notebookStorage'

// 样本太少时正确率是噪声：做 2 题对 2 题不等于 100%。攒够这个数再把它当主指标
const MIN_SAMPLE = 10

const day = iso => new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })

function ExamCountdown({ date, go }) {
  const [days, setDays] = useState(() => examCountdownDays(date))
  useEffect(() => {
    let timer
    const refresh = () => {
      clearTimeout(timer)
      const now = new Date()
      setDays(examCountdownDays(date, now))
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timer = setTimeout(refresh, midnight - now)
    }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [date])
  if (days === null) return null
  return <section className="exam-countdown" aria-label="考试倒计时">
    <button className={`exam-countdown-display${days >= 10000 ? ' is-long' : ''}`}
      onClick={() => go('data', { page: 'countdown' })} title="点击设置考试倒计时">
      <span className="exam-countdown-copy">
        <span className="exam-countdown-label">{days > 0 ? '距离考试' : days === 0 ? '今天考试，祝你顺利' : '考试日期已过'}</span>
        <time dateTime={date}>{date.replaceAll('-', '.')}</time>
      </span>
      {days > 0 ? <span className="exam-countdown-value">
        <strong className="exam-countdown-days">{days}</strong><span>天</span>
      </span> : <span className="exam-countdown-status">{days === 0 ? '今天' : '修改日期'}</span>}
      <span className="exam-countdown-chevron" aria-hidden="true">›</span>
    </button>
  </section>
}

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
  const { records, subject, examDate } = useStore()
  const notebook = useNotebook()
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
      <PageHeader
        title={<span className="brand-title"><img src="./icon-192.png" alt="" aria-hidden="true" />考基宝</span>}
        action={<ThemeToggle />}
      />
      <SubjectSeg />
      {examDate && <ExamCountdown date={examDate} go={go} />}
      {Object.values(records).some(r => r.superseded?.length) && <div className="card" role="status">
        <b>题面勘误已同步</b>
        <span className="muted">题目复核发现材料缺失或内容问题，受影响的旧版作答已作废，不再影响错题本和正确率。旧记录仍保存在导出备份中；已修订题可重新练习，待核实题已暂停使用。</span>
      </div>}

      <div className="card study-overview">
        <div className="overview-label"><span>学习进度</span><span>{subject}</span></div>
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
              <b className="hero-num flat">{st.done ? `再做 ${MIN_SAMPLE - st.done} 题就能看出水平` : '从第一题开始'}</b>
              <span className="muted">答满 {MIN_SAMPLE} 题后显示正确率</span>
            </div>
          )}
        </div>

        {enough && <Gauge value={st.acc} />}

        <div className="hero-foot">
          <span>已做<b>{st.done}<i>/{total}</i></b></span>
          <span>错题待清<b style={st.wrong ? { color: 'var(--bad)' } : null}>{st.wrong}</b></span>
          <span>最近模拟考<b>{last ? (last.score ?? '已作废') : '未考'}</b></span>
        </div>
      </div>

      <div className="today">
        <span>今日练习<b>{ef.today}</b>题</span>
        <span>累计作答<b>{ef.answers}</b>次，覆盖<b>{ef.covered}</b>题</span>
      </div>

      {/* 两个刷题入口并排：左边接着上次，右边打乱来一小轮 */}
      <section className="home-start"><div className="home-section-title"><h2>开始学习</h2></div>
      <div className="grid2 go-pair">
        <button className="go go-seq" onClick={() => go('chapters')}>
          <Icon name="list" />
          <b>章节练习</b>
          <small>{chs2.length} 章 · 按教材目录练或考</small>
        </button>
        <button className="go go-rand" onClick={() => go('practice', { scope: 'all', order: 'rand' })}>
          <Icon name="dice" />
          <b>随机 {randN} 题</b>
          <small>随机抽题 · 即时解析</small>
        </button>
      </div>

      </section>

      <section className="home-library"><div className="home-section-title"><h2>资料库</h2></div>
      <button className="notebook-home" onClick={() => go('notebook')}>
        <span className="notebook-home-icon"><Icon name="list" /></span>
        <span><b>我的笔记本</b><small>{notebook.error ? '打开查看笔记' : notebook.notes.length ? `${notebook.notes.filter(n => n.status === 'ready').length} 条精华${notebook.notes.some(n => n.status !== 'ready') ? ' · 有摘录待处理' : ' · 按章节快速回顾'}` : '摘录与考点回顾'}</small></span>
        <Icon name="right" />
      </button>

      <div className="grid2">
        <button className="tile" onClick={() => go('formula')}>
          <b><Icon name="calc" /> 公式攻坚</b>
          <small>科目二 · 公式与例题</small>
        </button>
        <button className="tile" onClick={() => go('map')}>
          <b><Icon name="map" /> 知识图谱</b>
          <small>章节考点速览</small>
        </button>
        <button className="tile" onClick={() => go('numbers')}>
          <b><Icon name="numbers" /> 数字必背</b>
          <small>{numberN} 张数字题卡</small>
        </button>
        <button className="tile" onClick={() => go('tools')}>
          <b><Icon name="grid" /> 学习工具</b>
          <small>时间线 · 运作图解</small>
        </button>
      </div>

      </section>

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

      <section className="section home-exams">
        <div className="section-head">
          <h2>最近模拟考</h2>
          {exams.length > 0 && <span className="muted">及格线 {PASS} 分</span>}
        </div>
        {exams.length ? (
          <div className="list">
            {exams.map(e => (
              <div className="list-item" key={e.id}>
                <span className={`score-chip ${e.score >= PASS ? 'pass' : 'fail'}`}>{e.score ?? '已作废'}</span>
                <span className="grow muted">{e.voidedQuestionIds?.length > 0 && `已作废 ${e.voidedQuestionIds.length} 题 · `}答对 {e.right}/{e.total} · 用时 {Math.round(e.usedMs / 60000)} 分</span>
                <span className="muted num">
                  {new Date(e.ts).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            <div><b>还没有考试记录</b>完成模拟考后查看成绩。</div>
            <button className="btn-sm" onClick={() => go('exam')}>开始模拟考</button>
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
