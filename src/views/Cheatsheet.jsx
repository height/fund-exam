import { DEFAULT_CHEATSHEET_PROMPT, loadCheatsheetPrompt, saveCheatsheetPrompt } from '../lib/cheatsheetPrompt'
import { useThinkingLevel } from '../lib/useThinkingLevel'
import { useEffect, useState } from 'react'
import { PageHeader, ThemeToggle, Icon } from '../components/ui'
import ChatLoading from '../components/ChatLoading'
import { getKey } from '../lib/ai'
import { useNotebook } from '../lib/notebookStorage'
import { cheatsheetFingerprint } from '../lib/cheatsheetStorage'
import '../notebook.css'

export default function Cheatsheet({ go, generation }) {
  const { notes, loading, error: notesError } = useNotebook()
  const [effort, setEffort, levels] = useThinkingLevel('cheatsheet')
  const [savedPrompt, setSavedPrompt] = useState(loadCheatsheetPrompt)
  const [promptDraft, setPromptDraft] = useState(loadCheatsheetPrompt)
  const [promptStatus, setPromptStatus] = useState('')
  const [promptError, setPromptError] = useState('')
  const promptDirty = promptDraft.trim() !== savedPrompt
  const savePrompt = () => {
    try { const value = saveCheatsheetPrompt(promptDraft); setSavedPrompt(value); setPromptDraft(value); setPromptError(''); setPromptStatus('已保存，下次生成生效') }
    catch (e) { setPromptError(e.message); setPromptStatus('') }
  }
  const { task, draft, result: savedResult, cacheLoading, busy, status, progress, error: taskError } = generation
  const result = draft || savedResult
  const [previewHTML, setPreviewHTML] = useState('')
  useEffect(() => {
    let active = true
    if (!result) return
    import('../lib/notebookPrint').then(({ notebookPrintHTML }) => {
      if (active) setPreviewHTML(notebookPrintHTML(result.notes, { sourceCount: result.sourceCount, generatedAt: result.createdAt, embedded: true }))
    }).catch(() => { if (active) setPreviewHTML('') })
    return () => { active = false }
  }, [result])
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const ready = notes.filter(n => n.status === 'ready')
  const chapterCount = new Set(ready.map(n => `${n.subject}:${n.chapter}`)).size
  const stale = result && result.fingerprint !== cheatsheetFingerprint(ready)
  const generate = () => {
    if (busy || draft || !ready.length || promptDirty) return
    setError('')
    task.start({ notes: ready, effort, prompt: savedPrompt, returnUrl: window.location.href })
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
      {loading || cacheLoading ? <p className="cs-loading" role="status">正在读取笔记与上次结果…</p> : result ? <section className="cs-document" aria-label={draft ? '本次生成的小抄' : '上次生成的小抄'}>
        <div className="cs-document-top"><span className="cs-format">A4 <i /> 双栏 <i /> 三色笔</span><span className="cs-cache-state">{draft ? '待保留' : '本地已保存'}</span></div>
        <div className="cs-document-title"><span className="cs-file-icon"><Icon name="list" size={24} /></span><div><h2>复习小抄</h2><p>{result.sourceCount} 条笔记，提炼为 <strong>{result.notes.length}</strong> 个考点</p></div></div>
        <div className="cs-document-bottom"><time>{new Date(result.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} 生成</time><span className="cs-export-formats">PDF / HTML</span></div>
        <details className="cs-inline-preview" open><summary>版面预览 <span>A4 等比缩放</span></summary>{previewHTML && <iframe title="小抄版面预览" sandbox="allow-scripts" srcDoc={previewHTML} />}</details>
        <button className="btn-pri cs-preview" disabled={opening} onClick={openPreview}>{opening ? '正在打开…' : '查看 / 打印'} <Icon name="chevronRight" size={16} /></button>
        {stale && <p className="cs-update-hint"><span />笔记有更新，可在下方重新生成</p>}
        <details className="cs-contents"><summary>考点目录 <span>{result.notes.length}<Icon name="chevronRight" size={14} /></span></summary><ol>{result.notes.map(n => <li key={n.id}>{n.title}</li>)}</ol></details>
      </section> : <section className="cs-intro"><span className="cs-format">A4 <i /> 双栏 <i /> 三色笔</span><h2>把重点，收在一张纸上</h2><p>合并关联知识，精简文字，保留图与公式。</p></section>}
      <section className="cs-generation" aria-label="生成设置">
        <div className="cs-generation-heading"><h2><Icon name="sparkle" size={16} />{result ? '更新小抄' : '生成小抄'}</h2><span>{ready.length} 条精华 · {chapterCount} 章</span></div>
        <div className="cs-generation-controls"><label><span>Thinking</span><select aria-label="Cheatsheet thinking depth" value={effort} disabled={busy || loading || cacheLoading} onChange={e => setEffort(e.target.value)}>{levels.map(level => <option key={level} value={level}>{level.toUpperCase()}</option>)}</select></label>
          {busy ? <button className="cs-cancel" disabled={status === 'saving'} onClick={task.cancel}>{status === 'saving' ? '正在保留…' : '取消生成'}</button> : <button className={result ? 'cs-regenerate' : 'btn-pri cs-generate'} disabled={loading || cacheLoading || !!draft || !ready.length || !!notesError || promptDirty} onClick={generate}>{result ? '重新生成' : '生成小抄'}<Icon name={result ? 'refresh' : 'sparkle'} size={15} /></button>}
        </div>
        <details className="cs-prompt-editor"><summary>生成 Prompt <span>{promptDirty ? '未保存' : savedPrompt === DEFAULT_CHEATSHEET_PROMPT ? '默认' : '自定义'}<Icon name="chevronRight" size={14} /></span></summary>
          <p>调整提炼规则与表达方式。笔记资料、JSON 输出格式和来源校验由系统自动附加。</p>
          <textarea aria-label="小抄生成 Prompt" value={promptDraft} disabled={busy} maxLength={20000} onChange={e => { setPromptDraft(e.target.value); setPromptStatus(''); setPromptError('') }} spellCheck={false} />
          <div className="cs-prompt-actions"><button type="button" disabled={busy || !promptDirty || !promptDraft.trim()} onClick={savePrompt}>保存 Prompt</button><button type="button" disabled={busy} onClick={() => { setPromptDraft(DEFAULT_CHEATSHEET_PROMPT); setPromptStatus('默认规则已填入，保存后生效'); setPromptError('') }}>恢复默认</button>{promptDirty && <button type="button" disabled={busy} onClick={() => { setPromptDraft(savedPrompt); setPromptStatus(''); setPromptError('') }}>取消修改</button>}</div>
          {promptStatus && <p role="status">{promptStatus}</p>}{promptError && <p role="alert" className="nb-error">{promptError}</p>}
        </details>
        {promptDirty && <p className="cs-generation-note">Prompt 有未保存修改，请先保存或取消修改后生成。</p>}
        {busy ? <div className="cs-progress">
          <ChatLoading mode={generation.effort === 'off' ? '' : generation.effort.toUpperCase()} retrying={progress?.retrying} received={progress?.received || 0} context="整体编排已保存的笔记，合并关联知识与重复内容。" completion="完成并校验后，可预览并选择保留。" />
          <p role="status">{progress ? `${progress.current} / ${progress.total} · ${progress.chapter}` : '正在准备…'}</p>
          <small>切换页面后会继续生成，可通过全局悬浮条查看进度。</small>
        </div> : <p className="cs-generation-note">{!loading && !ready.length ? '先在笔记本保存至少一条章节精华。' : '使用全部章节精华，待核对笔记不参与。'}</p>}
        {draft && <p className="cs-generation-note">本次小抄已生成，可先查看，再通过悬浮条保留或丢弃。上次保存的小抄仍保留。</p>}
        {(error || taskError || notesError) && <p className="nb-error" role="alert">{error || taskError || notesError}</p>}
        {!getKey() && <button className="btn-sm btn-ghost" onClick={() => go('data', { page: 'ai' })}>配置 AI 模型</button>}
      </section>
    </div>
  </>
}
