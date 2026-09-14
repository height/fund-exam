import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { capturesOf } from '../lib/notebook'
import { useNotebook } from '../lib/notebookStorage'
import NoteDetail from './NoteDetail'
import { Icon } from './ui'
import '../notebook.css'

export default function NoteModal({ go }) {
  const [opened, setOpened] = useState(null)
  useEffect(() => {
    const open = e => setOpened(current => current || e.detail)
    window.addEventListener('open-note', open)
    return () => window.removeEventListener('open-note', open)
  }, [])
  return opened && <NoteOverlay opened={opened} go={go} close={() => setOpened(null)} />
}

function NoteOverlay({ opened, go, close }) {
  const { notes, loading, error } = useNotebook()
  const [collapsed, setCollapsed] = useState(false)
  const [created, setCreated] = useState(false)
  const [id, setId] = useState(opened.id)
  const [state, setState] = useState({})
  const [confirmation, setConfirmation] = useState(null)
  const dialog = useRef(null)
  const confirmBox = useRef(null)
  const latest = useRef({})
  const pending = useRef(null)
  const savedNote = notes.find(n => n.id === id) || (opened.captureId && notes.find(n => capturesOf(n).some(c => c.id === opened.captureId)))
  const note = savedNote || opened.draft
  const isNew = !!opened.draft && !savedNote && !created
  const confirm = useCallback(options => new Promise(resolve => {
    pending.current = resolve; setConfirmation(options)
  }), [])
  const answer = value => { pending.current?.(value); pending.current = null; setConfirmation(null) }
  const requestClose = async () => {
    if (state.busy || pending.current) return false
    if (collapsed && state.dirty) setCollapsed(false)
    if (state.dirty && !await confirm({ title: '离开这次编辑？', body: '未发送的内容和未保存的修改建议将被放弃，已保存的笔记不受影响。', ok: '放弃并关闭', cancel: '继续编辑' })) return false
    close(); return true
  }
  latest.current = { requestClose, answer, confirmation }
  useEffect(() => {
    if (collapsed) return
    const trigger = document.activeElement
    const root = document.getElementById('root')
    const wasInert = root?.inert
    const scrollY = window.scrollY
    const old = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width, overflow: document.body.style.overflow }
    if (root) root.inert = true
    Object.assign(document.body.style, { position: 'fixed', top: `-${scrollY}px`, width: '100%', overflow: 'hidden' })
    if (!dialog.current?.contains(document.activeElement)) dialog.current?.focus()
    const key = e => {
      const box = latest.current.confirmation ? confirmBox.current : dialog.current
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); latest.current.confirmation ? latest.current.answer(false) : latest.current.requestClose() }
      if (e.key !== 'Tab') return
      const elements = [...box.querySelectorAll('button:not(:disabled),textarea:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(el => el.getClientRects().length)
      const first = elements[0], last = elements.at(-1)
      if (!first) { e.preventDefault(); box.focus(); return }
      if (!box.contains(document.activeElement) || document.activeElement === box || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
        e.preventDefault(); (e.shiftKey ? last : first).focus()
      }
    }
    document.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('keydown', key, true)
      if (root) root.inert = wasInert
      Object.assign(document.body.style, old); window.scrollTo(0, scrollY)
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
      pending.current?.(false)
    }
  }, [collapsed])
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => {
      const frame = dialog.current?.parentElement
      if (!frame) return
      frame.style.setProperty('--note-viewport-height', `${viewport?.height || window.innerHeight}px`)
      frame.style.setProperty('--note-viewport-top', `${viewport?.offsetTop || 0}px`)
    }
    update()
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])
  useEffect(() => {
    if (!confirmation) return
    const previous = document.activeElement
    confirmBox.current?.querySelector('button')?.focus()
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }) }
  }, [confirmation])
  return createPortal(<div className={`note-modal-backdrop overlay ${collapsed ? "is-collapsed" : ""}`} onClick={e => { if (e.target === e.currentTarget) requestClose() }}>
    <section className="note-modal" role={collapsed ? "region" : "dialog"} aria-modal={collapsed ? undefined : true} aria-labelledby="note-modal-title" tabIndex={-1} ref={dialog}>
      <div className="note-modal-content" inert={confirmation ? true : undefined}>
        <header className="note-modal-header"><div><h2 id="note-modal-title">{isNew ? '新建笔记' : state.editing ? '编辑笔记' : '笔记详情'}</h2>{state.dirty && <small>未保存</small>}</div><div className="note-modal-window-actions"><button className="btn-sm btn-ghost" disabled={!!confirmation} aria-label={collapsed ? '展开笔记浮层' : '收起笔记浮层'} title={collapsed ? '展开' : '收起'} onClick={() => { document.activeElement?.blur(); setCollapsed(v => !v) }}><Icon name={collapsed ? 'expand' : 'shrink'} /></button><button className="btn-sm btn-ghost" disabled={state.busy} aria-label="关闭笔记浮层" onClick={requestClose}><Icon name="x" /></button></div></header>
        <div className="note-modal-scroll">{loading ? <p role="status">正在读取笔记…</p> : error ? <p role="alert">{error}</p> : !note ? <p role="status">这条笔记已被删除或合并，请关闭后重新打开。</p> : <NoteDetail onResume={() => setCollapsed(false)} key={note.id} isNew={isNew} initialPrompt={opened.initialPrompt} sendOnOpen={opened.sendOnOpen} captureId={opened.captureId} note={note} allNotes={notes} autoEdit={opened.mode === 'edit'} onState={setState} confirm={confirm} onSaved={next => { setCreated(true); setId(next) }} onDeleted={close} go={async (...args) => { if (await requestClose()) go(...args) }} />}</div>
      </div>
      {confirmation && <div className="note-confirm-backdrop"><section className="note-confirm" ref={confirmBox} role="alertdialog" aria-modal="true" aria-label={confirmation.title} tabIndex={-1}><h3>{confirmation.title}</h3><p>{confirmation.body}</p><div className="grid2"><button onClick={() => answer(false)}>{confirmation.cancel}</button><button className="btn-pri" onClick={() => answer(true)}>{confirmation.ok}</button></div></section></div>}
    </section>
  </div>, document.body)
}
