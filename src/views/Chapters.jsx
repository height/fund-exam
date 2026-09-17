import { useState } from 'react'
import { Icon, PageHeader, SubjectSeg } from '../components/ui'
import { CHAPTER_EXAM_N, PASS, chapterStats, minutesFor } from '../lib/bank'
import { useStore } from '../lib/store'
import { CHAPTER_DETAILS } from '../data/chapters'

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
        subtitle={`按新版教材目录推进 · 已做 ${done}/${total} 题`}
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

      <div className="chapter-summary">
        <span>{chs.length} 章 · 已做 {done}/{total} 题</span>
        <span>{mode === 'practice' ? '即时解析' : `${PASS} 分及格`}</span>
      </div>

      <div className="chapter-list">
        {chs.map((c, i) => (
          <button className="ch-row" key={c.chapter} disabled={!c.total}
            onClick={() => (mode === 'practice'
              ? go('practice', { scope: `ch:${c.chapter}`, order: 'seq' })
              : go('exam', { ch: c.chapter }))}>
            <span className="ch-no num">{String(i + 1).padStart(2, '0')}</span>
            <span className="ch-body">
              <b>{c.chapter}</b>
              <small className="muted">
                {c.total
                  ? <>
                      {mode === 'practice'
                        ? `${CHAPTER_DETAILS[subject][c.chapter].sections.length} 节 · ${c.total} 题${c.done ? ` · 已做 ${c.done}` : ''}`
                        : `${Math.min(CHAPTER_EXAM_N, c.total)} 题 · ${minutesFor(Math.min(CHAPTER_EXAM_N, c.total))} 分钟 · 交卷后解析`}
                    </>
                  : '暂无题目'}
              </small>
            </span>
            <span className="ch-trailing">
              {c.acc !== null && <span className={`ch-acc num ${c.acc < PASS ? 'under' : ''}`}
                aria-label={`正确率 ${c.acc}%`}>{c.acc}%</span>}
              <Icon name="chevronRight" size={16} />
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
