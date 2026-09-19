import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Background, Handle, MiniMap, Panel, Position, ReactFlow, ReactFlowProvider,
  getViewportForBounds, useReactFlow, useViewport } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Icon, Speaker, SubjectSeg, ThemeToggle } from '../components/ui'
import { mdToSpeech } from '../lib/ai'
import { studyNoteSpeech } from '../lib/studyNotes'
import { KNOWLEDGE } from '../data/knowledge'
import { PASS, SUBJ_SHORT, chapterStats } from '../lib/bank'
import { ancestorsOf, chapterLabel, indexKnowledge, layoutKnowledge,
  searchKnowledge, toggleBranch, branchViewport } from '../lib/knowledgeGraph'
import { useStore } from '../lib/store'
import '../knowledgeMap.css'
import StudyNotes from '../components/StudyNotes'
import KnowledgePath from '../components/KnowledgePath'
import { KNOWLEDGE_PATHS, KNOWLEDGE_LINKS } from '../data/knowledgePaths'

const motionDuration = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220
const nodeTypes = { knowledge: memo(KnowledgeNode) }
const ariaLabels = {
  'node.a11yDescription.default': '点击父节点展开或收起，点击考点阅读笔记；也可按 Tab 选择、Enter 操作。',
  'minimap.ariaLabel': '知识图谱小地图',
}

function KnowledgeNode({ data }) {
  const gesture = useRef(null)
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
    <ReadElement className={`kg-node-read nodrag${branch ? ' kg-node-branch' : ''}`}
      onPointerDown={event => { gesture.current = { x: event.clientX, y: event.clientY, moved: false } }}
      onPointerMove={event => {
        const start = gesture.current
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) start.moved = true
      }}
      onPointerCancel={() => { if (gesture.current) gesture.current.moved = true }}
      onClick={root ? undefined : event => {
        const start = gesture.current
        if (event.detail && start && (start.moved || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8)) return
        branch ? onToggle(entry.id) : onSelect(entry.id)
      }}
      aria-expanded={branch ? expanded : undefined} aria-label={branch ? `${expanded ? '收起' : '展开'}：${entry.t}` : `阅读：${label}`}>
      <span className="kg-node-meta">{kind}{accuracy != null && <span className={accuracy < PASS ? 'kg-weak' : 'kg-good'}>{accuracy}% 正确率</span>}</span>
      <strong>{(data.lines || [label]).map((line, i) => <span className="kg-node-line" key={i}>{line}</span>)}</strong>
      <span className="kg-node-foot">{entry.depth === 0 ? `${entry.points} 组考点` : entry.depth === 1
        ? `${entry.children.length} 节 / ${entry.points} 组考点` : entry.depth === 2 ? `${entry.points} 组考点` : '点击阅读要点'}</span>
      {branch && <span className="kg-branch-indicator" aria-hidden="true">{expanded ? '−' : '+'}</span>}
    </ReadElement>
  </div>
}

function CanvasControls({ graph, request, containerRef, onFit }) {
  const flow = useReactFlow()
  const initialized = flow.viewportInitialized
  const { zoom } = useViewport()
  const fit = useCallback(() => {
    const element = containerRef.current
    if (!element?.clientWidth || !element.clientHeight || !graph.nodes.length) return
    const xs = graph.nodes.map(n => n.position.x), ys = graph.nodes.map(n => n.position.y)
    const bounds = { x: Math.min(...xs), y: Math.min(...ys),
      width: Math.max(...graph.nodes.map(n => n.position.x + n.width)) - Math.min(...xs),
      height: Math.max(...graph.nodes.map(n => n.position.y + n.height)) - Math.min(...ys) }
    // Reserve the corners for canvas controls instead of fitting nodes underneath them.
    const insetY = Math.min(56, element.clientHeight * .15)
    const viewport = getViewportForBounds(bounds, Math.max(1, element.clientWidth - 32), Math.max(1, element.clientHeight - insetY * 2), .12, 1, .07)
    return flow.setViewport({ ...viewport, x: viewport.x + 16, y: viewport.y + insetY }, { duration: motionDuration() })
  }, [flow, graph, containerRef])
  // Positions are known: navigation can run immediately after DOM layout, without
  // a deferred auto-fit racing a user's zoom/fit command after switching views.
  useEffect(() => {
    if (!initialized || !containerRef.current) return
    const element = containerRef.current
    let frame = 0
    const position = () => {
      if (!element.clientWidth || !element.clientHeight) return
      const target = graph.nodes.find(n => n.id === request.id)
      if (request.viewport) {
        flow.setViewport(request.viewport, { duration: 0 })
      } else if (target && request.anchor) {
        const children = graph.nodes.filter(n => target.data.entry.children.includes(n.id))
        flow.setViewport(branchViewport(target, request.anchor, request.previousViewport, element.clientWidth, element.clientHeight, children), { duration: motionDuration() })
      } else if (target && request.center) {
        const z = 1
        flow.setViewport({ x: element.clientWidth / 2 - (target.position.x + target.width / 2) * z,
          y: element.clientHeight / 2 - (target.position.y + target.height / 2) * z, zoom: z },
          { duration: motionDuration() })
      } else if (element.clientWidth < 600 && !request.fitAll) {
        const first = graph.nodes.find(n => n.data.entry.depth === 1)
        if (first) flow.setViewport({ x: 20 - first.position.x, y: 24 - first.position.y, zoom: 1 }, { duration: 0 })
      } else fit()
    }
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(position)
    })
    observer.observe(element)
    return () => { observer.disconnect(); cancelAnimationFrame(frame) }
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
  useEffect(() => {
    const root = document.documentElement
    const viewport = window.visualViewport
    let frame = 0
    root.setAttribute('data-knowledge-map', '')
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        // Safari's visual viewport shrinks for the keyboard and moves when it
        // reveals a focused field. Keep the workspace inside that visible area.
        if (viewport && viewport.scale !== 1) return
        root.style.setProperty('--kg-viewport-height', `${viewport?.height || window.innerHeight}px`)
        root.style.setProperty('--kg-viewport-top', `${viewport?.offsetTop || 0}px`)
      })
    }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      root.removeAttribute('data-knowledge-map')
      root.style.removeProperty('--kg-viewport-height')
      root.style.removeProperty('--kg-viewport-top')
    }
  }, [])
  return <section className="kg-workspace" aria-label="知识图谱学习工作台">
    <header className="kg-header">
      <button className="kg-icon-btn" aria-label="返回首页" onClick={() => go('home')}><Icon name="back" /></button>
      <div className="kg-heading"><h1>知识图谱</h1><span>先理解原理，再记住判断与边界</span></div>
      <div className="kg-subject"><SubjectSeg /></div>
      <ThemeToggle />
    </header>
    <ReactFlowProvider key={subject}><SubjectKnowledgeMap go={go} /></ReactFlowProvider>
  </section>
}

function SubjectKnowledgeMap({ go }) {
  const { records, subject, isDark } = useStore()
  const flow = useReactFlow()
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 600px)').matches)
  useEffect(() => {
    const media = matchMedia('(max-width: 600px)'), update = () => setCompact(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  const index = useMemo(() => indexKnowledge(KNOWLEDGE[subject] || []), [subject])
  const [chapterIndex, setChapterIndex] = useState(null)
  const [open, setOpen] = useState(() => new Set())
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState('path')
  const [navOpen, setNavOpen] = useState(false)
  const [request, setRequest] = useState({ id: 'subject' })
  const [announcement, setAnnouncement] = useState('')
  const [mini, setMini] = useState(false)
  const [reading, setReading] = useState(false)
  const noteScrollRef = useRef(null)
  const beforeFullscreen = useRef(null)
  const fullscreenButtonRef = useRef(null)
  const viewRef = useRef(null)
  const canvasRef = useRef(null), searchRef = useRef(null), detailRef = useRef(null), lastFocus = useRef(null), activeChapterRef = useRef(null)
  useEffect(() => {
    activeChapterRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [chapterIndex, navOpen])
  const selected = index.byId.get(selectedId)
  const points = useMemo(() => index.entries.filter(n => n.depth === 3), [index])
  const pointIndex = points.findIndex(n => n.id === selectedId)
  const results = useMemo(() => searchKnowledge(index, query), [index, query])
  const statsMap = useMemo(() => Object.fromEntries(chapterStats(records, subject, true).map(c => [c.chapter, c])), [records, subject])
  const graph = useMemo(() => layoutKnowledge(index, chapterIndex, open, SUBJ_SHORT[subject], compact), [index, chapterIndex, open, subject, compact])
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
    const node = graph.nodes.find(n => n.id === id)
    if (!node) return
    const previousViewport = flow.getViewport()
    const anchor = { x: (node.position.x + node.width / 2) * previousViewport.zoom + previousViewport.x,
      y: (node.position.y + node.height / 2) * previousViewport.zoom + previousViewport.y }
    setOpen(previous => toggleBranch(previous, id))
    setSelectedId(null)
    setChapterIndex(node.data.entry.chapterIndex)
    setRequest({ id, anchor, previousViewport })
    setAnnouncement(`${open.has(id) ? '已收起' : '已展开'}：${node.data.entry.t}`)
  }, [graph, flow, open])
  function toggleFullscreen() {
    if (reading) {
      setReading(false)
      if (beforeFullscreen.current) setRequest({ viewport: beforeFullscreen.current })
      requestAnimationFrame(() => fullscreenButtonRef.current?.focus({ preventScroll: true }))
    } else {
      beforeFullscreen.current = flow.getViewport()
      setNavOpen(false)
      setReading(true)
    }
  }
  function reveal(entry) {
    searchRef.current?.blur()
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
    setReading(false)
    requestAnimationFrame(() => {
      // Returning from a search result must not reopen the iOS keyboard.
      const target = lastFocus.current?.isConnected && lastFocus.current !== searchRef.current
        ? lastFocus.current : viewRef.current?.querySelector('[aria-selected="true"]')
      target?.focus({ preventScroll: true })
    })
  }
  useEffect(() => {
    if (selectedId) detailRef.current?.focus({ preventScroll: true })
    if (noteScrollRef.current) noteScrollRef.current.scrollTop = 0
    if (!selectedId) setReading(false)
  }, [selectedId])
  useEffect(() => {
    const onKey = e => {
      if (e.key === '/' && !reading && !e.target.closest('input,textarea,[contenteditable="true"]')) {
        e.preventDefault(); searchRef.current?.focus(); setNavOpen(true)
      }
      if (e.key === 'Escape') {
        if (reading) toggleFullscreen()
        else if (selectedId) closeDetail()
        else { setQuery(''); setNavOpen(false) }
      }
      if (e.key === 'Tab' && reading) {
        const focusable = [...detailRef.current?.closest('.kg-detail')?.querySelectorAll('button:not(:disabled),summary,a[href]') || []].filter(el => el.getClientRects().length)
        const first = focusable[0], last = focusable.at(-1)
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reading, selectedId])
  const nodes = useMemo(() => graph.nodes.map(node => ({ ...node,
    focusable: false, draggable: false, selectable: false,
    data: { ...node.data, selected: selectedId === node.id, onSelect: select, onToggle: toggle,
      accuracy: node.data.entry.depth === 1 && statsMap[node.data.entry.chapter]?.done >= 3 ? statsMap[node.data.entry.chapter].acc : null },
  })), [graph, selectedId, select, toggle, statsMap])
  const selectedChapter = selected && index.chapters[selected.chapterIndex]
  const stat = selected && statsMap[selected.chapter]
  const path = KNOWLEDGE_PATHS[subject]
  const related = (KNOWLEDGE_LINKS[`${subject}|${selected?.t}`] || []).map(title => points.find(point => point.t === title)).filter(Boolean)

  return <>
    <div className="kg-toolbar">
      <button className="kg-nav-toggle" aria-label="章节导航" aria-expanded={navOpen} onClick={() => setNavOpen(!navOpen)}>章节</button>
      <label className="kg-search"><Icon name="search" size={17} />
        <input ref={searchRef} value={query} placeholder="搜索章节或考点" aria-label="搜索知识图谱"
          type="search" enterKeyHint="search" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          onFocus={() => { if (query.trim()) setNavOpen(true) }} onChange={e => { setQuery(e.target.value); setNavOpen(true) }}
          onKeyDown={e => { if (e.key === 'Enter' && results.length) reveal(results[0]) }} />
        {query ? <button aria-label="清空搜索" onClick={() => { setQuery(''); searchRef.current?.focus() }}><Icon name="x" size={14} /></button> : <kbd>/</kbd>}
      </label>
      <div ref={viewRef} className="kg-view-switch" role="tablist" aria-label="图谱视图">
        <button role="tab" aria-selected={mode === 'path'} onClick={() => { setMode('path'); setNavOpen(false); setReading(false) }}>主线</button>
        <button role="tab" aria-selected={mode === 'map'} onClick={() => { setMode('map'); setNavOpen(false); setReading(false) }}>脑图</button>
        <button role="tab" aria-selected={mode === 'outline'} onClick={() => { setMode('outline'); setNavOpen(false); setReading(false) }}>大纲</button>
      </div>
    </div>
    <div className={`kg-body${selected ? ' has-detail' : ''}`}>
      {navOpen && <button className="kg-nav-scrim" aria-label="关闭章节导航" onClick={() => { setNavOpen(false); setQuery('') }} />}
      <aside className={`kg-navigator${navOpen ? ' is-open' : ''}`} aria-label={query.trim() ? '搜索结果' : '章节目录'} inert={reading && selected && !navOpen ? true : undefined}>
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
      <section className="kg-study" aria-label="图谱内容" inert={reading && selected ? true : undefined}>
        <div className="kg-context">
          <div><span className="kg-context-label">{subject}</span>
            <h2>{SUBJ_SHORT[subject]}</h2>
            <p>{`${index.chapters.length} 章，${totalPoints} 组考点`}</p>
          </div>
          {mode !== 'path' && <button className="kg-text-button" onClick={() => {
            setOpen(new Set(allExpanded ? [] : index.entries.filter(n => n.children.length).map(n => n.id)))
            setRequest({ id: 'subject', fitAll: true }); setSelectedId(null)
          }}>{allExpanded ? '收起全部' : '展开全部'}</button>}
        </div>
        {mode === 'path' ? <KnowledgePath path={path} index={index} chapterIndex={chapterIndex} onChapter={chooseChapter} onSelect={reveal} /> : mode === 'map' ? <div ref={canvasRef} className="kg-canvas" data-testid="knowledge-canvas">
          <ReactFlow nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} nodesDraggable={false} nodesConnectable={false} proOptions={{ hideAttribution: true }}
            elementsSelectable={false} edgesFocusable={false} nodesFocusable={false} deleteKeyCode={null}
            minZoom={.12} maxZoom={2} panOnDrag zoomOnPinch zoomOnScroll zoomOnDoubleClick={false}
            colorMode={isDark ? 'dark' : 'light'} ariaLabelConfig={ariaLabels}
            defaultEdgeOptions={{ style: { stroke: 'var(--kg-line)', strokeWidth: 1.6 } }}>
            <Background color="var(--kg-dot)" gap={28} size={.8} />
            <CanvasControls graph={graph} request={request} containerRef={canvasRef} onFit={() => setAnnouncement('已显示全部可见节点')} />
            {mini && <MiniMap pannable zoomable nodeColor="var(--accent-soft)" nodeStrokeColor="var(--accent-ink)" nodeStrokeWidth={2}
              maskColor="var(--kg-map-mask)" bgColor="var(--sheet)" position="bottom-right" />}
            <Panel position="top-right"><button className="kg-minimap-toggle" aria-label="小地图" aria-pressed={mini} onClick={() => setMini(!mini)}>小地图</button></Panel>
          </ReactFlow>
          <div className="kg-gesture-hint">点击节点展开 / 收起 · 点击考点阅读 · 拖动与双指缩放</div>
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
        <footer className="kg-status"><span>{mode === 'path' ? '原理 → 章节 → 判断' : mode === 'map' ? `显示 ${nodes.length} 个节点` : '大纲阅读'}<span className="kg-status-path"> / {totalPoints} 组考点</span></span>
          <span>点击考点阅读要点</span></footer>
      </section>
      {selected && <aside className={`kg-detail${reading ? ' is-reading' : ''}`} role="complementary" aria-label="考点详情"
        data-note-subject={subject} data-note-chapter={selected.chapter} data-note-title={selected.t}>
        <div className="kg-detail-top"><div className="kg-note-tools"><span>{selected.depth === 3 ? '考点笔记' : selected.depth === 2 ? '本节内容' : '章节概览'}</span>
          {selected.d && <Speaker key={selected.id} getText={() => mdToSpeech(studyNoteSpeech(selected))} label="朗读考点笔记" />}</div>
          <button className="kg-note-practice" aria-label="练习本章题目" disabled={!stat?.total} onClick={() => go('practice', { scope: `ch:${selected.chapter}`, order: 'seq' })}>
            {stat?.total ? `练习 ${stat.total} 题` : '暂无题目'} <Icon name="chevronRight" size={16} /></button>
          <button ref={fullscreenButtonRef} className="kg-reading-toggle" aria-label={reading ? '退出笔记全屏' : '笔记全屏'} title={reading ? '退出笔记全屏' : '笔记全屏'} aria-pressed={reading} onClick={toggleFullscreen}><Icon name={reading ? 'shrink' : 'expand'} size={16} /></button>
          <button className="kg-icon-btn" aria-label="关闭考点详情" onClick={closeDetail}><Icon name="x" size={18} /></button></div>
        {pointIndex >= 0 && <nav className="kg-point-nav" aria-label="连续复习">
          <button disabled={pointIndex === 0} onClick={() => reveal(points[pointIndex - 1])}>上一考点</button>
          <span>{pointIndex + 1} / {points.length} 组</span>
          <button disabled={pointIndex === points.length - 1} onClick={() => reveal(points[pointIndex + 1])}>下一考点</button>
        </nav>}
        <div className="kg-detail-scroll" ref={noteScrollRef}>
          <p className="kg-detail-path">第 {selected.chapterIndex + 1} 章 / {selectedChapter.t}{selected.depth === 3 && <><br />{index.byId.get(selected.parent).t}</>}</p>
          <h2 ref={detailRef} tabIndex={-1}>{selected.t}</h2>
          {selected.review ? <StudyNotes key={selected.id} review={selected.review} study={selected.study} />
            : selected.d ? <div className="kg-detail-copy"><span className="kg-note-label">学习要点</span><p>{selected.d}</p></div>
            : <div className="kg-detail-children">{selected.children.map(id => <button key={id} onClick={() => reveal(index.byId.get(id))}>{index.byId.get(id).t}<Icon name="chevronRight" size={16} /></button>)}</div>}
          {!!related.length && <nav className="kg-related" aria-label="关联知识"><h3>连起来理解</h3>{related.map(entry => <button key={entry.id} onClick={() => reveal(entry)}>{entry.t}<Icon name="chevronRight" size={14} /></button>)}</nav>}

        </div>
      </aside>}
    </div>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
  </>
}
