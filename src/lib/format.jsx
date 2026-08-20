/* 题干 / 解析的排版。原来靠拼 HTML 字符串 + 手动转义，改成直接出 React 节点 */
import { PLAIN } from './bank'

export const fmtTime = ms => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * 从 PDF 抽出来的题干，有 36 道的 Ⅰ Ⅱ Ⅲ 是跟正文连成一行的（另 118 道自带换行）。
 * 渲染时补上断行，但「Ⅰ、Ⅱ、Ⅲ」这类并列引用不能拆——所以前一个字符是顿号、
 * 连词、括号或另一个罗马数字时就跳过。全库跑过：36 道被补，已有换行的一道没被多拆。
 */
const ENUM = /(?<![\n、，,／/和与或及（(\sⅠ-Ⅹ])(?=[Ⅰ-Ⅹ])/g

/** 题干里的 Ⅰ、Ⅱ… 各占一行，悬挂缩进 */
export function Stem({ text, style }) {
  const [first, ...rest] = String(text).replace(ENUM, '\n').split('\n')
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

/**
 * AI 输出的 Markdown 子集渲染：**粗体**、`代码`、# 标题、- / 1. 列表、空行分段。
 * 模型在这个场景就写这些；全走 React 节点，不碰 innerHTML，没有 XSS 面。
 * 流式中途出现未闭合的 ** 会按原样显示，流完自然纠正。
 */
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`)/
function inline(s) {
  return s.split(INLINE).map((p, i) =>
    p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b>
    : p.startsWith('`') ? <code key={i}>{p.slice(1, -1)}</code>
    : p)
}

// 表格行 |a|b|c|；分隔行 |---|---| 只是画线，不进数据
const ROW = /^\|(.+)\|\s*$/
const RULE = /^\|[\s:|-]+\|\s*$/

export function Md({ text }) {
  const blocks = []
  let list = null
  let table = null
  const endList = () => { if (list) { blocks.push(list); list = null } }
  const endTable = () => { if (table) { blocks.push(table); table = null } }
  const flush = () => { endList(); endTable() }

  String(text).split('\n').forEach(l => {
    const t = l.trim()
    if (/^[-*_]{3,}$/.test(t)) { flush(); return } // --- 分隔线只是喘口气，不进内容
    const row = ROW.exec(t)
    if (row) {
      if (RULE.test(t)) return
      endList()
      if (!table) table = { rows: [] }
      table.rows.push(row[1].split('|').map(c => c.trim()))
      return
    }
    // bullet 后必须有空格，不然 **加粗开头** 的行会被吃掉一个星号
    const li = t.match(/^(?:[-*•]\s+|(\d+)[.、）)]\s*)(.+)/)
    if (li) {
      endTable()
      if (!list || list.ordered !== !!li[1]) { endList(); list = { ordered: !!li[1], items: [] } }
      list.items.push(li[2])
    } else {
      flush()
      if (t) blocks.push(t)
    }
  })
  flush()

  return (
    <div className="md">
      {blocks.map((b, i) => {
        if (b.rows) {
          const [head, ...body] = b.rows
          return (
            <div className="md-table" key={i}>
              <table>
                <thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
                <tbody>
                  {body.map((r, j) => (
                    <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
        if (typeof b !== 'string') {
          const Tag = b.ordered ? 'ol' : 'ul'
          return <Tag key={i}>{b.items.map((it, j) => <li key={j}>{inline(it)}</li>)}</Tag>
        }
        return b.startsWith('#')
          ? <b className="md-h" key={i}>{inline(b.replace(/^#+\s*/, ''))}</b>
          : <p key={i}>{inline(b)}</p>
      })}
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
