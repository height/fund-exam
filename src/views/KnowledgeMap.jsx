import { useMemo, useState } from 'react'
import { SubjectSeg } from '../components/ui'
import { KNOWLEDGE } from '../data/knowledge'
import { PASS, chapterStats } from '../lib/bank'
import { useStore } from '../lib/store'

/**
 * 知识图谱：横向脑图树（SVG）。章节 → 主题 → 必背要点三层。
 * 章节/主题点击展开收起，要点点击在底部浮层看详情。
 * 布局是最朴素的 tidy tree：可见的末端节点各占一行，父节点取子节点的纵向中点。
 */
const ROW = 36
const X = [8, 176, 356] // 各层左边距，超出三层就贴最后一档
const FS = [13, 12, 12] // 各层字号，汉字宽 ≈ 字号
const H = [32, 28, 26]

const fs = d => FS[Math.min(d, 2)]
// 汉字按整字号、ASCII 按 0.55 估宽——SVG 没有免费的 ellipsis，宽度只能算出来
const textW = (t, f) => [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? f : f * 0.55), 0)

function nodeW(node, depth, badge) {
  return 22 + textW(node.t, fs(depth)) + (node.c ? 15 : 0) + (badge ? 42 : 0)
}

/** 展开状态 → 可见节点坐标（y 是中线）与连线 */
function layout(chapters, open, accOf) {
  const nodes = []
  const edges = []
  let row = 0
  function walk(n, depth, id, chapter) {
    const kids = n.c && open.has(id) ? n.c.map((k, i) => walk(k, depth + 1, `${id}.${i}`, chapter)) : []
    const acc = depth === 0 ? accOf(n.t) : null
    const node = {
      n, depth, id, chapter, acc,
      hasKids: !!n.c, open: open.has(id),
      x: X[Math.min(depth, 2)],
      w: nodeW(n, depth, acc != null),
      y: kids.length
        ? (kids[0].y + kids[kids.length - 1].y) / 2
        : (row++ + 0.5) * ROW,
    }
    nodes.push(node)
    kids.forEach(k => edges.push([node, k]))
    return node
  }
  chapters.forEach((ch, i) => {
    walk(ch, 0, `${i}`, ch.t)
    row += 0.35 // 章节之间留口气
  })
  return { nodes, edges, height: row * ROW + 8 }
}

function allIds(chapters) {
  const out = []
  const walk = (n, id) => { if (n.c) { out.push(id); n.c.forEach((k, i) => walk(k, `${id}.${i}`)) } }
  chapters.forEach((ch, i) => walk(ch, `${i}`))
  return out
}

export default function KnowledgeMap({ go }) {
  const { records, subject } = useStore()
  const chapters = KNOWLEDGE[subject] || []
  // 默认只展开章节这一层：先看清骨架，再逐个点开啃
  const [open, setOpen] = useState(new Set())
  const [sel, setSel] = useState(null)

  const accMap = useMemo(() => {
    const m = {}
    chapterStats(records, subject).forEach(c => { if (c.done >= 3) m[c.chapter] = c.acc })
    return m
  }, [records, subject])

  const { nodes, edges, height } = useMemo(
    () => layout(chapters, open, t => accMap[t] ?? null),
    [chapters, open, accMap],
  )
  const width = Math.max(...nodes.map(n => n.x + n.w), 320) + 16
  const expanded = open.size > 0

  function tap(node) {
    if (node.hasKids) {
      const next = new Set(open)
      next.has(node.id) ? next.delete(node.id) : next.add(node.id)
      // 收起主题时顺带收起它下面已展开的分支，免得再点开时跳出一大坨
      if (!next.has(node.id)) [...next].forEach(id => { if (id.startsWith(`${node.id}.`)) next.delete(id) })
      setOpen(next)
    }
    setSel(node.n.d || !node.hasKids ? node : null)
  }

  return (
    <>
      <header className="appbar">
        <button className="btn-sm btn-ghost" onClick={() => go('home')} aria-label="返回首页">‹ 返回</button>
        <SubjectSeg />
        <button className="btn-sm btn-ghost"
          onClick={() => { setOpen(expanded ? new Set() : new Set(allIds(chapters))) ; setSel(null) }}>
          {expanded ? '全部收起' : '全部展开'}
        </button>
      </header>

      <p className="muted map-hint">章节 → 主题 → 必背要点。点节点展开，点要点看详情；正确率来自你的练习记录。</p>

      <div className="map-wrap card">
        <svg width={width} height={height} role="tree" aria-label={`${subject}知识图谱`}>
          {edges.map(([p, c]) => {
            const x1 = p.x + p.w, x2 = c.x, mx = (x1 + x2) / 2
            return <path key={c.id} className="map-edge"
              d={`M${x1},${p.y} C${mx},${p.y} ${mx},${c.y} ${x2},${c.y}`} />
          })}
          {nodes.map(node => {
            const { n, depth, id, x, y, w, hasKids, open: on, acc } = node
            const h = H[Math.min(depth, 2)]
            const cls = `map-node d${Math.min(depth, 2)}${sel?.id === id ? ' sel' : ''}${hasKids ? '' : ' leaf'}`
            return (
              <g key={id} className={cls} transform={`translate(${x},${y})`}
                role="treeitem" tabIndex={0} aria-expanded={hasKids ? on : undefined}
                aria-label={n.t} onClick={() => tap(node)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(node) } }}>
                <rect x="0" y={-h / 2} width={w} height={h} rx={h / 2} />
                <text x={hasKids ? 24 : 12} y="4" fontSize={fs(depth)}>
                  {hasKids && <tspan className="map-caret">{on ? '▾' : '▸'}</tspan>}
                  {hasKids ? ' ' : ''}{n.t}
                  {acc != null &&
                    <tspan className={acc < PASS ? 'map-acc under' : 'map-acc'} dx="6">{acc}%</tspan>}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {sel && (
        <div className="map-detail card" role="dialog" aria-label={sel.n.t}>
          <div className="row between">
            <b>{sel.n.t}</b>
            <button className="btn-sm btn-ghost" onClick={() => setSel(null)} aria-label="关闭">✕</button>
          </div>
          {sel.n.d && <p>{sel.n.d}</p>}
          <button className="btn-sm" onClick={() => go('practice', { scope: `ch:${sel.chapter}`, order: 'seq' })}>
            去练「{sel.chapter}」的题 ›
          </button>
        </div>
      )}
    </>
  )
}
