/* 几个视图里反复出现的小块 */
import { SUBJECTS, SUBJ_SHORT, stats } from '../lib/bank'
import { ExplainBody, Plain } from '../lib/format'
import { useStore } from '../lib/store'

export function SubjectSeg() {
  const { records, subject, setSubject } = useStore()
  return (
    <div className="seg" role="tablist">
      {SUBJECTS.map(s => {
        const st = stats(records, s)
        return (
          <button key={s} role="tab" aria-selected={s === subject}
            className={s === subject ? 'on' : ''} onClick={() => setSubject(s)}>
            {s}<small>{SUBJ_SHORT[s]} · {st.total} 题</small>
          </button>
        )
      })}
    </div>
  )
}

export function ThemeToggle() {
  const { isDark, setTheme } = useStore()
  const label = `切换到${isDark ? '浅色' : '深色'}主题`
  return (
    <button className="btn-sm btn-ghost" aria-label={label} title={label}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}>
      {isDark ? '☀︎ 浅色' : '☾ 深色'}
    </button>
  )
}

/**
 * 选项列表。picked / answer 都给了就是「已揭晓」状态：对的标绿、选错的标红。
 * onPick 为空时渲染成不可点的 div（回顾场景）。
 */
export function Options({ q, picked, reveal, selected, onPick }) {
  return (
    <div className="opts">
      {q.options.map((o, i) => {
        let cls = 'opt'
        if (reveal) {
          if (i === q.answer) cls += ' ok'
          else if (i === picked) cls += ' bad'
        } else if (selected === i) cls += ' sel'
        const inner = <><em>{'ABCD'[i]}</em><span>{o}</span></>
        return onPick
          ? <button className={cls} key={i} data-pick={i} disabled={reveal}
              onClick={() => onPick(i)}>{inner}</button>
          : <div className={cls} key={i}>{inner}</div>
      })}
    </div>
  )
}

/** 正确答案 + 解析 + 小白版讲解 */
export function Explain({ q, picked }) {
  const ok = picked === q.answer
  return (
    <div className={`explain ${ok ? 'right' : 'wrong'}`}>
      <div className="explain-head">
        正确答案 {'ABCD'[q.answer]}
        {picked === undefined
          ? <span className="verdict wrong">未作答</span>
          : <span className={`verdict ${ok ? 'right' : 'wrong'}`}>
              {ok ? '答对' : `你选了 ${'ABCD'[picked]}`}
            </span>}
      </div>
      <ExplainBody text={q.explain} />
      <Plain id={q.id} />
    </div>
  )
}
