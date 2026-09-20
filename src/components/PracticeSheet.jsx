import { useEffect, useRef } from 'react'
import { practiceQuestionStatus } from '../lib/practiceSheet'

export default function PracticeSheet({ session, records, onJump, onClose, onClear, busy }) {
  const panel = useRef(null)
  const historicalCount = session.qs.filter(q => records[q.id]?.seen).length
  const answered = session.qs.filter((q, i) => session.picks[i] !== undefined).length
  useEffect(() => {
    const previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector('[aria-current="true"]')?.focus()
    return () => { document.body.style.overflow = overflow; previous?.focus() }
  }, [])

  function keyDown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); if (!busy) onClose(); return }
    if (e.key !== 'Tab') return
    const buttons = [...panel.current.querySelectorAll('button:not(:disabled)')]
    const first = buttons[0], last = buttons.at(-1)
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
  }

  return <div className="overlay practice-sheet" role="dialog" aria-modal="true" aria-label="练习答题卡"
    onKeyDown={keyDown} onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
    <div className="panel" ref={panel}>
      <div className="row between"><h2>全部题目</h2><button onClick={onClose} disabled={busy}>关闭</button></div>
      <p className="muted">当前练习共 {session.qs.length} 题 · 历史已做 {historicalCount} 题 · 本轮已答 {answered} 题，点击题号跳转。</p>
      <div className="practice-sheet-legend"><span className="right">✓ 最近答对</span><span className="wrong">× 最近答错</span><span>未做</span><span>描边为当前题</span></div>
      <div className="sheet">
        {session.qs.map((q, i) => {
          const state = practiceQuestionStatus(q, records[q.id], session.picks[i])
          return <button key={q.id} disabled={busy} className={`${state.tone} ${i === session.i ? 'cur' : ''}`}
            aria-current={i === session.i ? 'true' : undefined} aria-label={`第 ${i + 1} 题，${state.label}`}
            onClick={() => onJump(i)}><span>{i + 1}</span><small>{state.tone === 'r' ? '✓' : state.tone === 'w' ? '×' : '·'}</small></button>
        })}
      </div>
      <p className="muted">本轮未答的题显示上次对错，已答的题显示本轮结果；不回显上次所选选项，可以直接重新作答。</p>
      <button className="btn-danger" disabled={busy || !(answered || historicalCount)} onClick={onClear}>{busy ? '正在清除…' : '清除这些题的记录'}</button>
    </div>
  </div>
}
