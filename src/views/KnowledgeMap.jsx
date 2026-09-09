import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Background, Handle, MiniMap, Panel, Position, ReactFlow, ReactFlowProvider,
  getViewportForBounds, useReactFlow, useViewport } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Icon, SubjectSeg, ThemeToggle } from '../components/ui'
import { KNOWLEDGE } from '../data/knowledge'
import { PASS, SUBJ_SHORT, chapterStats } from '../lib/bank'
import { ancestorsOf, chapterLabel, indexKnowledge, layoutKnowledge,
  searchKnowledge, toggleBranch } from '../lib/knowledgeGraph'
import { useStore } from '../lib/store'
import '../knowledgeMap.css'

const motionDuration = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220
const nodeTypes = { knowledge: memo(KnowledgeNode) }
const ariaLabels = {
  'node.a11yDescription.default': '按 Tab 选择节点，按 Enter 阅读，使用展开按钮查看下一级。',
  'minimap.ariaLabel': '知识图谱小地图',
}

function KnowledgeNode({ data }) {
  const { entry, root, overview, expanded, selected, onSelect, onToggle, accuracy } = data
  const branch = entry.children.length > 0
  const label = data.label || entry.t
  const kind = entry.depth === 0 ? '科目总览' : entry.depth === 1
    ? `第 ${String(entry.chapterIndex + 1).padStart(2, '0')} 章` : entry.depth === 2 ? '章节内容' : '考点'
  const ReadElement = entry.depth === 0 ? 'div' : 'button'
  return <div className={`kg-node kg-depth-${entry.depth}${root ? ' kg-root' : ''}${overview ? ' kg-overview-node' : ''}${data.left ? ' kg-left-branch' : ''}${selected ? ' is-selected' : ''}`}>
    {!root && <Handle type="target" position={data.left ? Position.Right : Position.Left}
      id={data.left ? 'right-in' : 'left-in'} />}
    {(branch || entry.depth === 0) && <Handle type="source" position={data.left ? Position.Left : Position.Right} id={data.left ? 'left' : 'right'} />}
    {entry.depth === 0 && <Handle type="source" position={Position.Left} id="left" />}
    <ReadElement className="kg-node-read nodrag nopan" onClick={() => onSelect(entry.id)}
      aria-label={`阅读：${label}`}>
      <span className="kg-node-meta">{kind}{accuracy != null && <span className={accuracy < PASS ? 'kg-weak' : 'kg-good'}>{accuracy}% 正确率</span>}</span>
      <strong>{label}</strong>
      <span className="kg-node-foot">{entry.depth === 0 ? `${entry.points} 组考点` : entry.depth === 1
        ? `${entry.children.length} 节 / ${entry.points} 组考点` : entry.depth === 2 ? `${entry.points} 组考点` : '点击阅读要点'}</span>
    </ReadElement>
    {branch && <button className="kg-branch-toggle nodrag nopan" aria-expanded={expanded}
      aria-label={`${expanded ? '收起' : '展开'}：${entry.t}`} onClick={() => onToggle(entry.id)}>{expanded ? '−' : '+'}</button>}
  </div>
}

function CanvasControls({ graph, request, containerRef, onFit }) {
  const flow = useReactFlow()
  const initialized = flow.viewportInitialized
  const { zoom } = useViewport()
  const fit = useCallback(() => {
    const element = containerRef.current
    if (!element || !graph.nodes.length) return
    const xs = graph.nodes.map(n => n.position.x), ys = graph.nodes.map(n => n.position.y)
    const bounds = { x: Math.min(...xs), y: Math.min(...ys),
      width: Math.max(...graph.nodes.map(n => n.position.x + n.width)) - Math.min(...xs),
      height: Math.max(...graph.nodes.map(n => n.position.y + n.height)) - Math.min(...ys) }
    return flow.setViewport(getViewportForBounds(bounds, element.clientWidth, element.clientHeight, .12, 1, .07),
      { duration: motionDuration() })
  }, [flow, graph, containerRef])
  // Positions are known: navigation can run immediately after DOM layout, without
  // a deferred auto-fit racing a user's zoom/fit command after switching views.
  useEffect(() => {
    if (!initialized || !containerRef.current) return
    const element = containerRef.current
    const target = graph.nodes.find(n => n.id === request.id)
    if (target && request.center) {
      const z = element.clientWidth < 600 ? .85 : 1
      flow.setViewport({ x: element.clientWidth / 2 - (target.position.x + target.width / 2) * z,
        y: element.clientHeight / 2 - (target.position.y + target.height / 2) * z, zoom: z },
        { duration: motionDuration() })
    } else fit()
  }, [initialized, graph, request, flow, fit, containerRef])
  return <Panel position="bottom-left" className="kg-canvas-tools" aria-label="画布操作">
    <button title="缩小" aria-label="缩小" disabled={zoom <= .121} onClick={() => flow.zoomOut({ duration: motionDuration() })}>−</button>
    <button className="kg-zoom-value" title="恢复 100%" aria-label="恢复 100%" onClick={() => flow.zoomTo(1, { duration: motionDuration() })}>{Math.round(zoom * 100)}%</button>
    <button title="放大" aria-label="放大" disabled={zoom >= 1.99} onClick={() => flow.zoomIn({ duration: motionDuration() })}>+</button>
    <span className="kg-tool-divider" />
    <button aria-label="适应画布" title="适应画布" onClick={() => { fit(); onFit() }}><Icon name="expand" size={17} /></button>
  </Panel>
}

export default function KnowledgeMap({ go }) {
  const { subject } = useStore()
  const [full, setFull] = useState(false)
  const [fullHint, setFullHint] = useState('')
  const shellRef = useRef(null), fullButtonRef = useRef(null)
  const closeFull = useCallback(() => {
    setFull(false)
    setFullHint('')
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    requestAnimationFrame(() => fullButtonRef.current?.focus())
  }, [])
  async function toggleFull() {
    if (full) return closeFull()
    setFull(true)
    if (shellRef.current?.requestFullscreen) {
      try { await shellRef.current.requestFullscreen(); setFullHint('') }
      catch { setFullHint('已铺满窗口，可按 Esc 退出') }
    } else setFullHint('已铺满窗口，可点击右上角退出')
  }
  useEffect(() => {
    const shell = shellRef.current
    const sync = () => { if (!document.fullscreenElement) { setFull(false); fullButtonRef.current?.focus() } }
    document.addEventListener('fullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      if (document.fullscreenElement === shell) document.exitFullscreen?.().catch(() => {})
    }
  }, [])
  useEffect(() => {
    if (!full) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); closeFull() }
      if (e.key === 'Tab') {
        const items = [...shellRef.current.querySelectorAll('button:not(:disabled), input, select, a[href], [tabindex="0"]')]
          .filter(el => el.getClientRects().length)
        const first = items[0], last = items.at(-1)
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', onKey) }
  }, [full, closeFull])
  function navigate(...args) { closeFull(); go(...args) }
  return <section ref={shellRef} className={`kg-workspace${full ? ' kg-fullscreen' : ''}`} aria-label="知识图谱学习工作台">
    <header className="kg-header">
      <button className="kg-icon-btn" aria-label="返回首页" onClick={() => navigate('home')}><Icon name="back" /></button>
      <div className="kg-heading"><h1>知识图谱</h1><span>从章节脉络，读懂每个考点</span></div>
      <div className="kg-subject"><SubjectSeg /></div>
      <ThemeToggle />
      <button ref={fullButtonRef} className="kg-full-btn" onClick={toggleFull} aria-label={full ? '退出全屏' : '全屏查看'} aria-pressed={full}>
        <Icon name={full ? 'shrink' : 'expand'} size={17} /><span>{full ? '退出全屏' : '全屏'}</span>
      </button>
    </header>
    {fullHint && <span className="sr-only" role="status">{fullHint}</span>}
    <ReactFlowProvider key={subject}><SubjectKnowledgeMap go={navigate} /></ReactFlowProvider>
  </section>
}

function SubjectKnowledgeMap({ go }) {
  const { records, subject, isDark } = useStore()
  const index = useMemo(() => indexKnowledge(KNOWLEDGE[subject] || []), [subject])
  const [chapterIndex, setChapterIndex] = useState(null)
  const [open, setOpen] = useState(() => new Set())
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('map')
  const [navOpen, setNavOpen] = useState(false)
  const [request, setRequest] = useState({ id: 'subject' })
  const [announcement, setAnnouncement] = useState('')
  const [mini, setMini] = useState(false)
  const canvasRef = useRef(null), searchRef = useRef(null), detailRef = useRef(null), lastFocus = useRef(null), activeChapterRef = useRef(null)
  useEffect(() => {
    activeChapterRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [chapterIndex, navOpen])
  const selected = index.byId.get(selectedId)
  const results = useMemo(() => searchKnowledge(index, query), [index, query])
  const statsMap = useMemo(() => Object.fromEntries(chapterStats(records, subject, true).map(c => [c.chapter, c])), [records, subject])
  const graph = useMemo(() => layoutKnowledge(index, chapterIndex, open, SUBJ_SHORT[subject]), [index, chapterIndex, open, subject])
  const allExpanded = index.entries.filter(n => n.children.length).every(n => open.has(n.id))
  const totalPoints = index.chapters.reduce((n, ch) => n + ch.points, 0)

  const chooseChapter = useCallback(i => {
    setChapterIndex(i); setSelectedId(null); setNavOpen(false); setQuery('')
    if (i != null) setOpen(previous => new Set([...previous, `ch-${i}`]))
    setRequest({ id: i == null ? 'subject' : `ch-${i}`, center: i != null })
  }, [])
  const select = useCallback(id => {
    const entry = index.byId.get(id)
    if (!entry) return
    if (entry.depth === 1) return chooseChapter(entry.chapterIndex)
    lastFocus.current = document.activeElement
    setSelectedId(id)
    setRequest({ id, center: true })
  }, [index, chapterIndex, chooseChapter])
  const toggle = useCallback(id => {
    setOpen(previous => toggleBranch(previous, id))
    setRequest({ id, center: true })
  }, [])
  function reveal(entry) {
    lastFocus.current = searchRef.current
    setChapterIndex(entry.chapterIndex)
    setOpen(previous => new Set([...previous, ...ancestorsOf(index, entry.id), ...(entry.children.length ? [entry.id] : [])]))
    setSelectedId(entry.id); setNavOpen(false); setQuery('')
    setRequest({ id: entry.id, center: true })
    setAnnouncement(`已定位：${entry.chapter}，${entry.t}`)
  }
  function closeDetail() {
    setRequest({ id: selectedId, center: true })
    setSelectedId(null)
    requestAnimationFrame(() => {
      if (lastFocus.current?.isConnected) lastFocus.current.focus()
      else searchRef.current?.focus()
    })
  }
  useEffect(() => {
    if (selectedId) detailRef.current?.focus({ preventScroll: true })
  }, [selectedId])
  useEffect(() => {
    const onKey = e => {
      if (e.key === '/' && !e.target.closest('input,textarea,[contenteditable="true"]')) {
        e.preventDefault(); searchRef.current?.focus(); setNavOpen(true)
      }
      if (e.key === 'Escape') { setQuery(''); setNavOpen(false); setSelectedId(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const nodes = useMemo(() => graph.nodes.map(node => ({ ...node,
    focusable: false, draggable: false, selectable: false,
    data: { ...node.data, selected: selectedId === node.id, onSelect: select, onToggle: toggle,
      accuracy: node.data.entry.depth === 1 && statsMap[node.data.entry.chapter]?.done >= 3 ? statsMap[node.data.entry.chapter].acc : null },
  })), [graph, selectedId, select, toggle, statsMap])
  const selectedChapter = selected && index.chapters[selected.chapterIndex]
  const stat = selected && statsMap[selected.chapter]

  return <>
    <div className="kg-toolbar">
      <button className="kg-nav-toggle" aria-label="章节导航" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>章节</button>
      <label className="kg-search"><Icon name="search" size={17} />
        <input ref={searchRef} value={query} placeholder="搜索章节、考点或关键词" aria-label="搜索知识图谱"
          onFocus={() => { if (query.trim()) setNavOpen(true) }} onChange={e => { setQuery(e.target.value); setNavOpen(true) }}
          onKeyDown={e => { if (e.key === 'Enter' && results.length) reveal(results[0]) }} />
        {query ? <button aria-label="清空搜索" onClick={() => { setQuery(''); searchRef.current?.focus() }}><Icon name="x" size={14} /></button> : <kbd>/</kbd>}
      </label>
      <div className="kg-view-switch" role="tablist" aria-label="图谱视图">
        <button role="tab" aria-selected={mode === 'map'} onClick={() => { setMode('map'); setNavOpen(false) }}>脑图</button>
        <button role="tab" aria-selected={mode === 'outline'} onClick={() => { setMode('outline'); setNavOpen(false) }}>大纲</button>
      </div>
    </div>
    <div className={`kg-body${selected ? ' has-detail' : ''}`}>
      {navOpen && <button className="kg-nav-scrim" aria-label="关闭章节导航" onClick={() => { setNavOpen(false); setQuery('') }} />}
      <aside className={`kg-navigator${navOpen ? ' is-open' : ''}`} aria-label={query.trim() ? '搜索结果' : '章节目录'}>
        <div className="kg-nav-heading"><strong>{query.trim() ? '搜索结果' : '章节目录'}</strong>
          <span>{query.trim() ? `${results.length} 个匹配` : `${index.chapters.length} 章`}</span></div>
        {query.trim() ? <div className="kg-results" aria-live="polite">
          {!results.length && <div className="kg-empty"><Icon name="search" size={24} /><strong>没有找到相关内容</strong><p>试试更短的关键词，如“风险”或“收益”。</p><button onClick={() => setQuery('')}>返回章节目录</button></div>}
          {results.map(entry => <button key={entry.id} onClick={() => reveal(entry)}>
            <small>第 {entry.chapterIndex + 1} 章 / {entry.depth === 1 ? '章' : entry.depth === 2 ? '节' : '考点'}</small>
            <strong>{entry.t}</strong><span>{entry.depth === 1 ? `${entry.points} 组考点` : entry.chapter}</span>
          </button>)}
        </div> : <>
          <button className={`kg-overview${chapterIndex == null ? ' active' : ''}`} onClick={() => chooseChapter(null)} aria-pressed={chapterIndex == null}>
            <span>全科总览</span><small>{totalPoints} 组考点</small>
          </button>
          <nav aria-label="按章学习" className="kg-chapter-list">
            {index.chapters.map((entry, i) => {
              const st = statsMap[entry.chapter]
              return <button key={entry.id} ref={chapterIndex === i ? activeChapterRef : undefined} className={chapterIndex === i ? 'active' : ''} aria-current={chapterIndex === i ? 'true' : undefined}
                aria-label={`第 ${i + 1} 章 ${entry.t}`} onClick={() => chooseChapter(i)}>
                <span className="kg-ch-number">{String(i + 1).padStart(2, '0')}</span>
                <span><strong>{entry.t}</strong><small>{entry.children.length} 节 / {entry.points} 组考点</small></span>
                {st?.done >= 3 && <span className={`kg-nav-accuracy ${st.acc < PASS ? 'kg-weak' : 'kg-good'}`}>{st.acc}%</span>}
              </button>
            })}
          </nav>
          <p className="kg-nav-note">按新版教材章节组织<br />正确率来自本章练习记录</p>
        </>}
      </aside>
      <section className="kg-study" aria-label="图谱内容">
        <div className="kg-context">
          <div><span className="kg-context-label">{subject}</span>
            <h2>{SUBJ_SHORT[subject]}</h2>
            <p>{`${index.chapters.length} 章，${totalPoints} 组考点`}</p>
          </div>
          <button className="kg-text-button" onClick={() => {
            setOpen(new Set(allExpanded ? [] : index.entries.filter(n => n.children.length).map(n => n.id)))
            setRequest({ id: 'subject' }); setSelectedId(null)
          }}>{allExpanded ? '收起全部' : '展开全部'}</button>
        </div>
        {mode === 'map' ? <div ref={canvasRef} className="kg-canvas" data-testid="knowledge-canvas">
          <ReactFlow nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false} proOptions={{ hideAttribution: true }}
            elementsSelectable={false} edgesFocusable={false} nodesFocusable={false} deleteKeyCode={null}
            minZoom={.12} maxZoom={2} panOnDrag zoomOnPinch zoomOnScroll zoomOnDoubleClick={false}
            colorMode={isDark ? 'dark' : 'light'} ariaLabelConfig={ariaLabels}
            defaultEdgeOptions={{ style: { stroke: 'var(--kg-line)', strokeWidth: 1.6 } }}>
            <Background color="var(--kg-dot)" gap={24} size={1} />
            <CanvasControls graph={graph} request={request} containerRef={canvasRef} onFit={() => setAnnouncement('已显示全部可见节点')} />
            {mini && <MiniMap pannable zoomable nodeColor="var(--accent-soft)" nodeStrokeColor="var(--accent-ink)" nodeStrokeWidth={2}
              maskColor="var(--kg-map-mask)" bgColor="var(--sheet)" position="bottom-right" />}
            <Panel position="top-right"><button className="kg-minimap-toggle" aria-label="小地图" aria-pressed={mini} onClick={() => setMini(!mini)}>小地图</button></Panel>
          </ReactFlow>
          <div className="kg-gesture-hint">拖动画布移动 · 滚轮或双指缩放</div>
        </div> : <div className="kg-outline" aria-label="知识大纲">
          {index.chapters.map(ch => <section key={ch.id} className="kg-outline-chapter">
            <button className="kg-outline-ch-title" onClick={() => chooseChapter(ch.chapterIndex)}>{chapterLabel(ch)}</button>
            {ch.children.map(id => {
              const section = index.byId.get(id)
              return <div className="kg-outline-section" key={id}>
                <button className="kg-outline-toggle" aria-expanded={open.has(id)} onClick={() => toggle(id)}>
                  <span>{open.has(id) ? '−' : '+'}</span><strong>{section.t}</strong><small>{section.points} 组</small>
                </button>
                {open.has(id) && <div className="kg-outline-points">{section.children.map(leafId => {
                  const leaf = index.byId.get(leafId)
                  return <button key={leafId} className={selectedId === leafId ? 'selected' : ''} onClick={() => {
                    lastFocus.current = document.activeElement; setSelectedId(leafId)
                  }}><strong>{leaf.t}</strong><span>{leaf.d}</span></button>
                })}</div>}
              </div>
            })}
          </section>)}
        </div>}
        <footer className="kg-status"><span>{mode === 'map' ? `显示 ${nodes.length} 个节点` : '大纲阅读'}<span className="kg-status-path"> / 章 → 节 → 考点</span></span>
          <span>点击考点阅读要点</span></footer>
      </section>
      {selected && <aside className="kg-detail" role="complementary" aria-label="考点详情">
        <div className="kg-detail-top"><span>{selected.depth === 3 ? '考点笔记' : selected.depth === 2 ? '本节内容' : '章节概览'}</span>
          <button className="kg-icon-btn" aria-label="关闭考点详情" onClick={closeDetail}><Icon name="x" size={18} /></button></div>
        <div className="kg-detail-scroll">
          <p className="kg-detail-path">第 {selected.chapterIndex + 1} 章 / {selectedChapter.t}{selected.depth === 3 && <><br />{index.byId.get(selected.parent).t}</>}</p>
          <h2 ref={detailRef} tabIndex={-1}>{selected.t}</h2>
          {selected.d ? <div className="kg-detail-copy"><span className="kg-note-label">学习要点</span><p>{selected.d}</p></div>
            : <div className="kg-detail-children">{selected.children.map(id => <button key={id} onClick={() => reveal(index.byId.get(id))}>{index.byId.get(id).t}<span>›</span></button>)}</div>}

        </div>
        <div className="kg-detail-action"><button className="btn-pri" aria-label="练习本章题目" disabled={!stat?.total} onClick={() => go('practice', { scope: `ch:${selected.chapter}`, order: 'seq' })}>
          {stat?.total ? `练习本章 ${stat.total} 题` : '本章暂无可练题目'} <span aria-hidden="true">›</span></button>
          <small>{stat?.done ? `已练 ${stat.done} 题${stat.done >= 3 ? `，正确率 ${stat.acc}%` : ''}` : '按本章范围练习'}</small></div>
      </aside>}
    </div>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
  </>
}
