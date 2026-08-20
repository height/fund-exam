/* 题干 / 解析的排版。原来靠拼 HTML 字符串 + 手动转义，改成直接出 React 节点 */
import { PLAIN } from './bank'

export const fmtTime = ms => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** 题干里的 Ⅰ、Ⅱ… 各占一行，悬挂缩进 */
export function Stem({ text, style }) {
  const [first, ...rest] = String(text).split('\n')
  return (
    <div className="stem" style={style}>
      {first}
      {rest.map((l, i) => <span className="roman" key={i}>{l}</span>)}
    </div>
  )
}

// 解析按 （1）/1、/选项A/① 拆条，避免一大坨
const ITEM = /^(（[0-9０-９一二三四五六七八九十]+）|选项[ABCD]|[①②③④⑤⑥⑦⑧⑨⑩]|\d{1,2}、)/
const SEP = ''

function splitExplain(t) {
  return String(t)
    .replace(/(?=（[0-9０-９一二三四五六七八九十]+）)/g, SEP)
    .replace(/(?=选项[ABCD])/g, SEP)
    .replace(/(?=[①②③④⑤⑥⑦⑧⑨⑩])/g, SEP)
    .replace(/(?<![A-Za-z0-9０-９])(?=\d{1,2}、)/g, SEP) // R1、R2 这类不拆
    .split(SEP)
    .map(s => s.trim())
    .filter(Boolean)
}

export function ExplainBody({ text }) {
  if (!text) return <div className="explain-body"><p>本题暂无解析</p></div>
  return (
    <div className="explain-body">
      {splitExplain(text).map((p, i) => (
        <p className={ITEM.test(p) ? 'itm' : ''} key={i}>{p}</p>
      ))}
    </div>
  )
}

/** 小白版讲解：按【x】小节拆行，折叠在原解析下方 */
export function Plain({ id }) {
  const t = PLAIN[id]
  if (!t) return null
  return (
    <details className="plain">
      <summary>讲得再白一点</summary>
      <div className="plain-body">
        {t.split('\n').filter(Boolean).map((l, i) => {
          const m = l.match(/^【([^】]+)】([\s\S]*)$/)
          return m ? <p key={i}><b>{m[1]}</b>{m[2]}</p> : <p key={i}>{l}</p>
        })}
      </div>
    </details>
  )
}
