import { chapterAccuracy } from '../lib/chapterAccuracy'

export function ChapterAccuracy({ chapter, summary = `${chapter.total} 题 · 已做 ${chapter.done}` }) {
  if (!chapter.total) return <span className="chapter-accuracy-label">暂无题目</span>
  const { tone, percent, label } = chapterAccuracy(chapter)
  const conciseLabel = !chapter.done && chapter.total >= 10 ? '满 10 题可评估' : label.replace('待评估 · ', '')
  return <span className={`chapter-accuracy is-${tone}`}>
    <span className="chapter-accuracy-label">{summary} · {conciseLabel}</span>
    {percent === null
      ? <span className="chapter-accuracy-track is-pending" aria-hidden="true" />
      : <span className="chapter-accuracy-track" role="meter"
        aria-label={`${chapter.chapter}累计正确率`} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={percent} aria-valuetext={label}>
        <span className="chapter-accuracy-fill" style={{ width: `${percent}%` }} />
        <span className="chapter-accuracy-pass" aria-hidden="true" />
      </span>}
  </span>
}

export function ChapterAccuracyHint() {
  return <p className="chapter-accuracy-hint">每章做满 10 道不同题后评估；正确率按累计作答计算，短线标记 60% 合格线。</p>
}
