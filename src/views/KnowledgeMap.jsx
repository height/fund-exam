import { useMemo, useRef, useState } from 'react'
import { SubjectSeg } from '../components/ui'
import { KNOWLEDGE } from '../data/knowledge'
import { PASS, SUBJ_SHORT, chapterStats } from '../lib/bank'
import { useStore } from '../lib/store'

/**
 * 知识图谱：横向脑图树（SVG）。根（科目）→ 章节 → 主题 → 必背要点。
 * 章节/主题点击展开收起，要点点击在底部浮层看详情。
 * 布局是最朴素的 tidy tree：可见的末端节点各占一行，父节点取子节点的纵向中点；
 * 每层列宽按该层可见节点的最大宽度算，不留死数。
 */
const ROW = 32
const GAP = 28
const FS = [14, 13, 12, 12]

// 汉字按整字号、ASCII 按 0.55 估宽——SVG 没有免费的 ellipsis，宽度只能算出来
const textW = (t, f) => [...t].reduce((a, ch) => a + (ch.charCodeAt(0) > 255 ? f : f * 0.55), 0)

/** 展开状态 → 可见节点坐标（y 是中线）与连线 */
function layout(chapters, open, accOf, rootLabel) {
  const nodes = []
  const edges = []
  let row = 0
  function walk(n, depth, id, chapter) {
    const kids = n.c && open.has(id) ? n.c.map((k, i) => walk(k, depth + 1, `${id}.${i}`, chapter)) : []
    const acc = depth === 1 ? accOf(n.t) : null
    const node = {
      n, depth, id, chapter, acc,
      hasKids: !!n.c, open: open.has(id),
      w: n.c
        ? 34 + textW(n.t, FS[Math.min(depth, 3)]) + (acc != null ? 44 : 0)
        : 28 + textW(n.t, FS[3]),
      y: kids.length
        ? (kids[0].y + kids[kids.length - 1].y) / 2
        : (row++ + 0.5) * ROW,
    }
    nodes.push(node)
    kids.forEach(k => edges.push([node, k]))
    return node
  }
  const chNodes = chapters.map((ch, i) => {
    const nd = walk(ch, 1, `${i}`, ch.t)
    row += 0.3 // 章节之间留口气
    return nd
  })
  const root = {
    n: { t: rootLabel }, depth: 0, id: 'r', hasKids: false, root: true,
    w: 26 + textW(rootLabel, FS[0]),
    y: chNodes.length ? (chNodes[0].y + chNodes[chNodes.length - 1].y) / 2 : ROW / 2,
  }
  nodes.push(root)
  chNodes.forEach(c => edges.push([root, c]))

  const colW = []
  nodes.forEach(nd => { colW[nd.depth] = Math.max(colW[nd.depth] || 0, nd.w) })
  const colX = colW.map((_, d) => colW.slice(0, d).reduce((a, w) => a + w + GAP, 8))
  nodes.forEach(nd => { nd.x = colX[nd.depth] })

  return {
    nodes, edges,
    height: row * ROW + 8,
    width: Math.max(...nodes.map(n => n.x + n.w)) + 16,
  }
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
  const wrapRef = useRef(null)

  const accMap = useMemo(() => {
    const m = {}
    chapterStats(records, subject).forEach(c => { if (c.done >= 3) m[c.chapter] = c.acc })
    return m
  }, [records, subject])

  const { nodes, edges, height, width } = useMemo(
    () => layout(chapters, open, t => accMap[t] ?? null, SUBJ_SHORT[subject]),
    [chapters, open, accMap, subject],
  )
  const expanded = open.size > 0

  function tap(node) {
    if (node.hasKids) {
      const next = new Set(open)
      if (next.has(node.id)) {
        next.delete(node.id)
        // 收起时顺带收起下面已展开的分支，免得再点开时跳出一大坨
        ;[...next].forEach(id => { if (id.startsWith(`${node.id}.`)) next.delete(id) })
      } else {
        next.add(node.id)
        // 展开的子节点长在右边，可能在屏幕外——把当前节点滚到左侧让位
        requestAnimationFrame(() =>
          wrapRef.current?.scrollTo({ left: Math.max(0, node.x - 48), behavior: 'smooth' }))
      }
      setOpen(next)
      setSel(null)
    } else {
      setSel(node)
    }
  }

  return (
    <>
      <header className="appbar">
        <button className="btn-sm btn-ghost" onClick={() => go('home')} aria-label="返回首页">‹ 返回</button>
        <SubjectSeg />
        <button className="btn-sm btn-ghost"
          onClick={() => { setOpen(expanded ? new Set() : new Set(allIds(chapters))); setSel(null) }}>
          {expanded ? '全部收起' : '全部展开'}
        </button>
      </header>

      <p className="muted map-hint">章节 → 主题 → 必背要点。点节点展开，点要点看详情；正确率来自你的练习记录。</p>

      <div className="map-wrap card" ref={wrapRef}>
        <svg width={width} height={height} role="tree" aria-label={`${subject}知识图谱`}
          onClick={() => setSel(null)}>
          {edges.map(([p, c]) => {
            const x1 = p.x + p.w, x2 = c.x, mx = (x1 + x2) / 2
            return <path key={c.id} className="map-edge"
              d={`M${x1},${p.y} C${mx},${p.y} ${mx},${c.y} ${x2},${c.y}`} />
          })}
          {nodes.map(node => {
            const { n, depth, id, x, y, w, hasKids, open: on, acc, root } = node
            if (root) return (
              <g key={id} className="map-node d0" transform={`translate(${x},${y})`}>
                <rect x="0" y="-18" width={w} height="36" rx="18" />
                <text x="13" y="5" fontSize={FS[0]}>{n.t}</text>
              </g>
            )
            const h = hasKids ? (depth === 1 ? 32 : 28) : 24
            const cls = `map-node d${depth}${sel?.id === id ? ' sel' : ''}${hasKids ? '' : ' leaf'}`
            return (
              <g key={id} className={cls} transform={`translate(${x},${y})`}
                role="treeitem" tabIndex={0} aria-expanded={hasKids ? on : undefined}
                aria-label={n.t}
                onClick={e => { e.stopPropagation(); tap(node) }}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(node) } }}>
                <rect x="0" y={-h / 2} width={w} height={h} rx={h / 2} />
                {hasKids
                  ? <path className="map-caret" d="M-2.5,-4 L2.5,0 L-2.5,4"
                      transform={`translate(16,0)${on ? ' rotate(90)' : ''}`} />
                  : <circle cx="10" cy="0" r="2.5" />}
                <text x={hasKids ? 25 : 19} y="4" fontSize={FS[Math.min(depth, 3)]}>
                  {n.t}
                  {acc != null &&
                    <tspan className={acc < PASS ? 'map-acc under' : 'map-acc'} dx="7">{acc}%</tspan>}
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
