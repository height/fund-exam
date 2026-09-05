import { useState } from 'react'
import { PageHeader, SubjectSeg } from '../components/ui'
import { CHAPTER_EXAM_N, PASS, chapterStats, minutesFor } from '../lib/bank'
import { useStore } from '../lib/store'

/*
 * 章节练习：按官方教材目录列章，点一章直接练或直接考。
 *
 * 顺序是教材章序，不是「弱项在前」——这页是拿来对着书按章推进的，
 * 顺序一变就跟书对不上了。首页那个「知识点掌握度」榜才按弱项排。
 * 一题都没有的章也列出来（灰掉），否则会误以为题库覆盖全了。
 */
export default function Chapters({ go }) {
  const { records, subject } = useStore()
  const [mode, setMode] = useState('practice')
  const chs = chapterStats(records, subject, true)

  const done = chs.reduce((a, c) => a + c.done, 0)
  const total = chs.reduce((a, c) => a + c.total, 0)

  return (
    <>
      <PageHeader
        variant="subpage"
        title="章节练习"
        subtitle={`按教材目录推进 · 已做 ${done}/${total} 题`}
        onBack={() => go('home')}
        backLabel="首页"
      />
      <SubjectSeg />

      <div className="row between">
        <div className="seg" role="tablist" style={{ flex: 1 }}>
          <button role="tab" aria-selected={mode === 'practice'}
            className={mode === 'practice' ? 'on' : ''} onClick={() => setMode('practice')}>
            练习<small>看解析</small>
          </button>
          <button role="tab" aria-selected={mode === 'exam'}
            className={mode === 'exam' ? 'on' : ''} onClick={() => setMode('exam')}>
            考试<small>计时</small>
          </button>
        </div>
      </div>

      <p className="muted ch-hint">
        {mode === 'practice'
          ? `点一章开始练，选完立刻出解析。已做 ${done}/${total} 题。`
          : `点一章抽最多 ${CHAPTER_EXAM_N} 题限时考，${PASS} 分及格，考中不看答案。`}
      </p>

      <div className="stack">
        {chs.map((c, i) => (
          <button className="ch-row" key={c.chapter} disabled={!c.total}
            onClick={() => (mode === 'practice'
              ? go('practice', { scope: `ch:${c.chapter}`, order: 'seq' })
              : go('exam', { ch: c.chapter }))}>
            <span className="ch-no num">{i + 1}</span>
            <span className="ch-body">
              <b>{c.chapter}</b>
              <small className="muted">
                {c.total
                  ? <>
                      {c.total} 题
                      {c.done ? ` · 做过 ${c.done}` : ' · 没做过'}
                      {mode === 'exam' && ` · 考 ${Math.min(CHAPTER_EXAM_N, c.total)} 题 ${minutesFor(Math.min(CHAPTER_EXAM_N, c.total))} 分钟`}
                    </>
                  : '题库里还没有这一章的题'}
              </small>
            </span>
            {c.acc !== null && (
              <span className={`ch-acc num ${c.acc < PASS ? 'under' : ''}`}>{c.acc}%</span>
            )}
          </button>
        ))}
      </div>
    </>
  )
}
