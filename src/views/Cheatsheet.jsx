import { DEFAULT_CHEATSHEET_PROMPT, loadCheatsheetPrompt, saveCheatsheetPrompt } from '../lib/cheatsheetPrompt'
import { getThinkingLevel, setThinkingLevel, THINKING_LEVELS } from '../lib/noteThinking'
import { useEffect, useRef, useState } from 'react'
import { PageHeader, ThemeToggle, Icon } from '../components/ui'
import ChatLoading from '../components/ChatLoading'
import { askCheatsheet, getKey } from '../lib/ai'
import { useNotebook } from '../lib/notebookStorage'
import { cheatsheetFingerprint, loadCheatsheet, saveCheatsheet } from '../lib/cheatsheetStorage'
import '../notebook.css'

export default function Cheatsheet({ go }) {
  const { notes, loading, error: notesError } = useNotebook()
  const [effort, setEffort] = useState(() => getThinkingLevel('cheatsheet'))
  const [savedPrompt, setSavedPrompt] = useState(loadCheatsheetPrompt)
  const [promptDraft, setPromptDraft] = useState(loadCheatsheetPrompt)
  const [promptStatus, setPromptStatus] = useState('')
  const [promptError, setPromptError] = useState('')
  const promptDirty = promptDraft.trim() !== savedPrompt
  const savePrompt = () => {
    try { const value = saveCheatsheetPrompt(promptDraft); setSavedPrompt(value); setPromptDraft(value); setPromptError(''); setPromptStatus('已保存，下次生成生效') }
    catch (e) { setPromptError(e.message); setPromptStatus('') }
  }
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
    if (busy || !ready.length || promptDirty) return
    if (!getKey()) { setError('请先配置 AI 模型，再生成小抄'); return }
    const ctl = new AbortController(); controller.current = ctl
    const timer = setTimeout(() => ctl.abort(), 1200000)
    setBusy(true); setProgress(null); setError('')
    try {
      const { notebookPrintHTML } = await import('../lib/notebookPrint')
      const condensed = await askCheatsheet(ready, ctl.signal, p => { if (!ctl.signal.aborted) setProgress(p) }, effort, savedPrompt)
      if (ctl.signal.aborted) return
      const createdAt = Date.now()
      const html = notebookPrintHTML(condensed, { sourceCount: ready.length, generatedAt: createdAt, returnUrl: window.location.href })
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
      const html = notebookPrintHTML(result.notes, { sourceCount: result.sourceCount, generatedAt: result.createdAt, returnUrl: window.location.href })
      preview.document.open(); preview.document.write(html); preview.document.close(); preview.__cheatsheetPopup = true; preview.opener = null
    } catch (e) { preview.close(); setError(`打开失败：${e.message}`) }
    finally { setOpening(false) }
  }
  return <>
    <PageHeader variant="subpage" title="复习小抄" onBack={() => go('notebook')} backLabel="笔记本" action={<ThemeToggle iconOnly />} />
    <div className="cs-page cs-workbench">
      {loading || cacheLoading ? <p className="cs-loading" role="status">正在读取笔记与上次结果…</p> : result ? <section className="cs-document" aria-label="上次生成的小抄">
        <div className="cs-document-top"><span className="cs-format">A4 <i /> 双栏 <i /> 三色笔</span><span className="cs-cache-state">{result.unsaved ? '尚未保存' : '本地已保存'}</span></div>
        <div className="cs-document-title"><span className="cs-file-icon"><Icon name="list" size={24} /></span><div><h2>复习小抄</h2><p>{result.sourceCount} 条笔记，提炼为 <strong>{result.notes.length}</strong> 个考点</p></div></div>
        <div className="cs-document-bottom"><time>{new Date(result.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} 生成</time><span className="cs-export-formats">PDF / HTML</span></div>
        <button className="btn-pri cs-preview" disabled={opening} onClick={openPreview}>{opening ? '正在打开…' : '查看 / 打印'} <Icon name="chevronRight" size={16} /></button>
        {stale && <p className="cs-update-hint"><span />笔记有更新，可在下方重新生成</p>}
        <details className="cs-contents"><summary>考点目录 <span>{result.notes.length}<Icon name="chevronRight" size={14} /></span></summary><ol>{result.notes.map(n => <li key={n.id}>{n.title}</li>)}</ol></details>
      </section> : <section className="cs-intro"><span className="cs-format">A4 <i /> 双栏 <i /> 三色笔</span><h2>把重点，收在一张纸上</h2><p>合并关联知识，精简文字，保留图与公式。</p></section>}
      <section className="cs-generation" aria-label="生成设置">
        <div className="cs-generation-heading"><h2><Icon name="sparkle" size={16} />{result ? '更新小抄' : '生成小抄'}</h2><span>{ready.length} 条精华 · {chapterCount} 章</span></div>
        <div className="cs-generation-controls"><label><span>Thinking</span><select aria-label="Cheatsheet thinking depth" value={effort} disabled={busy || loading || cacheLoading} onChange={e => { setEffort(e.target.value); setThinkingLevel(e.target.value, 'cheatsheet') }}>{THINKING_LEVELS.map(level => <option key={level} value={level}>{level.toUpperCase()}</option>)}</select></label>
          {busy ? <button className="cs-cancel" onClick={() => controller.current?.abort()}>取消生成</button> : <button className={result ? 'cs-regenerate' : 'btn-pri cs-generate'} disabled={loading || cacheLoading || !ready.length || !!notesError || promptDirty} onClick={generate}>{result ? '重新生成' : '生成小抄'}<Icon name={result ? 'refresh' : 'sparkle'} size={15} /></button>}
        </div>
        <details className="cs-prompt-editor"><summary>生成 Prompt <span>{promptDirty ? '未保存' : savedPrompt === DEFAULT_CHEATSHEET_PROMPT ? '默认' : '自定义'}<Icon name="chevronRight" size={14} /></span></summary>
          <p>调整提炼规则与表达方式。笔记资料、JSON 输出格式和来源校验由系统自动附加。</p>
          <textarea aria-label="小抄生成 Prompt" value={promptDraft} disabled={busy} maxLength={20000} onChange={e => { setPromptDraft(e.target.value); setPromptStatus(''); setPromptError('') }} spellCheck={false} />
          <div className="cs-prompt-actions"><button type="button" disabled={busy || !promptDirty || !promptDraft.trim()} onClick={savePrompt}>保存 Prompt</button><button type="button" disabled={busy} onClick={() => { setPromptDraft(DEFAULT_CHEATSHEET_PROMPT); setPromptStatus('默认规则已填入，保存后生效'); setPromptError('') }}>恢复默认</button>{promptDirty && <button type="button" disabled={busy} onClick={() => { setPromptDraft(savedPrompt); setPromptStatus(''); setPromptError('') }}>取消修改</button>}</div>
          {promptStatus && <p role="status">{promptStatus}</p>}{promptError && <p role="alert" className="nb-error">{promptError}</p>}
        </details>
        {promptDirty && <p className="cs-generation-note">Prompt 有未保存修改，请先保存或取消修改后生成。</p>}
        {busy ? <div className="cs-progress">
          <ChatLoading mode={effort === 'off' ? '' : effort.toUpperCase()} retrying={progress?.retrying} received={progress?.received || 0} context="整体编排已保存的笔记，合并关联知识与重复内容。" completion="全部完成并校验后保存小抄。" />
          <p role="status">{progress ? `${progress.current} / ${progress.total} · ${progress.chapter}` : '正在准备…'}</p>
          <small>离开将取消本次生成，已有小抄保留。</small>
        </div> : <p className="cs-generation-note">{!loading && !ready.length ? '先在笔记本保存至少一条章节精华。' : '使用全部章节精华，待核对笔记不参与。'}</p>}
        {(error || notesError) && <p className="nb-error" role="alert">{error || notesError}</p>}
        {!getKey() && <button className="btn-sm btn-ghost" onClick={() => go('data', { page: 'ai' })}>配置 AI 模型</button>}
      </section>
    </div>
  </>
}
