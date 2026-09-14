import { useEffect, useRef, useState } from 'react'
import { PageHeader, ThemeToggle, Icon } from '../components/ui'
import ChatLoading from '../components/ChatLoading'
import { askCheatsheet, getKey } from '../lib/ai'
import { useNotebook } from '../lib/notebookStorage'
import { cheatsheetFingerprint, loadCheatsheet, saveCheatsheet } from '../lib/cheatsheetStorage'
import '../notebook.css'

export default function Cheatsheet({ go }) {
  const { notes, loading, error: notesError } = useNotebook()
  const [result, setResult] = useState(null)
  const [cacheLoading, setCacheLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const controller = useRef(null)
  useEffect(() => {
    let active = true
    loadCheatsheet().then(value => { if (active) setResult(value) })
      .catch(() => { if (active) setError('上次小抄读取失败，可重新生成') })
      .finally(() => { if (active) setCacheLoading(false) })
    return () => { active = false; controller.current?.abort() }
  }, [])
  const ready = notes.filter(n => n.status === 'ready')
  const chapterCount = new Set(ready.map(n => `${n.subject}:${n.chapter}`)).size
  const stale = result && result.fingerprint !== cheatsheetFingerprint(ready)
  const generate = async () => {
    if (busy || !ready.length) return
    if (!getKey()) { setError('请先配置 AI 模型，再生成小抄'); return }
    const ctl = new AbortController(); controller.current = ctl
    const timer = setTimeout(() => ctl.abort(), 300000)
    setBusy(true); setProgress(null); setError('')
    try {
      const { notebookPrintHTML } = await import('../lib/notebookPrint')
      const condensed = await askCheatsheet(ready, ctl.signal, p => { if (!ctl.signal.aborted) setProgress(p) })
      if (ctl.signal.aborted) return
      const createdAt = Date.now()
      const html = notebookPrintHTML(condensed, { sourceCount: ready.length, generatedAt: createdAt })
      try { setResult(await saveCheatsheet(html, condensed, ready)) }
      catch {
        setResult({ html, notes: condensed, sourceCount: ready.length, createdAt, fingerprint: cheatsheetFingerprint(ready), unsaved: true })
        setError('小抄已生成，但本地保存失败。请点击查看 / 打印后下载保留。')
      }
    } catch (e) { setError(ctl.signal.aborted ? '生成已取消或超时，上次结果仍保留' : `生成失败：${e.message}`) }
    finally { clearTimeout(timer); controller.current = null; setBusy(false) }
  }
  const openPreview = async () => {
    if (!result || opening) return
    const preview = window.open('', '_blank')
    if (!preview) { setError('预览窗口被拦截，请允许此网站打开新窗口后重试'); return }
    setOpening(true)
    try {
      const { notebookPrintHTML } = await import('../lib/notebookPrint')
      const html = notebookPrintHTML(result.notes, { sourceCount: result.sourceCount, generatedAt: result.createdAt })
      preview.document.open(); preview.document.write(html); preview.document.close(); preview.opener = null
    } catch (e) { preview.close(); setError(`打开失败：${e.message}`) }
    finally { setOpening(false) }
  }
  return <>
    <PageHeader variant="subpage" title="复习小抄" onBack={() => go('notebook')} backLabel="笔记本" action={<ThemeToggle iconOnly />} />
    <div className="cs-page">
      <section className="cs-panel">
        <div className="cs-heading"><Icon name="sparkle" size={20} /><h2>把笔记整理成一份小抄</h2></div>
        <p>合并重复，提炼考点，保留条件、例外和公式。</p>
        <div className="cs-facts"><span><b>{ready.length}</b> 条精华</span><span><b>{chapterCount}</b> 个章节</span><span>A4 · 双栏 · 三色笔</span></div>
        <p className="cs-hint">收录全部已整理笔记，待核对内容不参与。生成完成后，再打开预览打印。</p>
        {loading || cacheLoading ? <p role="status">正在读取笔记与上次结果…</p> : busy ? <div className="cs-progress">
          <ChatLoading received={progress?.received || 0} context="按章节提炼已保存的笔记，合并重复内容。" completion="全部完成并校验后保存小抄。" />
          <p role="status">{progress ? `${progress.current} / ${progress.total} · ${progress.chapter}` : '正在准备…'}</p>
          <button className="btn-sm" onClick={() => controller.current?.abort()}>取消生成</button>
          <small>离开此页将取消本次生成，上次结果会保留。</small>
        </div> : <button className="btn-pri cs-generate" disabled={!ready.length || !!notesError} onClick={generate}>{result ? '重新生成' : '生成小抄'}</button>}
        {!loading && !ready.length && <p className="cs-hint">先在笔记本保存至少一条章节精华。</p>}
        {(error || notesError) && <p className="nb-error" role="alert">{error || notesError}</p>}
        {!getKey() && <button className="btn-sm btn-ghost" onClick={() => go('data', { page: 'ai' })}>配置 AI 模型</button>}
      </section>
      {result && <section className="cs-panel cs-result" aria-label="上次生成的小抄">
        <div className="cs-heading"><h2>已生成的小抄</h2><span>{result.unsaved ? '未保存到此设备' : '已保存到此设备'}</span></div>
        <p>{result.sourceCount} 条笔记 → {result.notes.length} 个考点</p>
        <time>{new Date(result.createdAt).toLocaleString('zh-CN', { hour12: false })}</time>
        {stale && <p className="cs-hint">笔记已更新，可以继续查看这份小抄，或重新生成。</p>}
        <ul className="cs-topics">{result.notes.slice(0, 5).map(n => <li key={n.id}>{n.title}</li>)}</ul>
        {result.notes.length > 5 && <small>另有 {result.notes.length - 5} 个考点</small>}
        <button className="btn-pri cs-preview" disabled={opening} onClick={openPreview}>{opening ? '正在打开…' : '查看 / 打印'} <Icon name="right" /></button>
        <small>打开独立预览，可另存 PDF 或下载 HTML。</small>
      </section>}
    </div>
  </>
}
