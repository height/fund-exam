import { CHEATSHEET_GENERATION_VERSION, DEFAULT_CHEATSHEET_PROMPT, loadCheatsheetPrompt, saveCheatsheetPrompt } from '../lib/cheatsheetPrompt'
import { useThinkingLevel } from '../lib/useThinkingLevel'
import { useEffect, useState } from 'react'
import { PageHeader, ThemeToggle, Icon } from '../components/ui'
import ChatLoading from '../components/ChatLoading'
import { PRESETS, getCfg, loadStore } from '../lib/ai'
import { useNotebook } from '../lib/notebookStorage'
import { cheatsheetFingerprint } from '../lib/cheatsheetStorage'
import { CHAPTERS } from '../data/chapters'
import { useStore } from '../lib/store'
import '../notebook.css'

export default function Cheatsheet({ go, generation, initialSubject }) {
  const { notes, loading, error: notesError } = useNotebook()
  const { subject: currentSubject } = useStore()
  const subject = Object.hasOwn(CHAPTERS, initialSubject) ? initialSubject : currentSubject
  const [provider, setProvider] = useState(() => {
    try { const saved = localStorage.getItem('cheatsheet-model-provider'); return PRESETS[saved] ? saved : '' } catch { return '' }
  })
  const modelStore = loadStore()
  const modelConfig = getCfg(provider ? { ...modelStore, active: provider } : modelStore)
  const selectProvider = value => {
    setProvider(value)
    try { localStorage.setItem('cheatsheet-model-provider', value) } catch { /* selection still works for this session */ }
  }
  const [effort, setEffort, levels] = useThinkingLevel('cheatsheet', modelConfig.model)
  const [savedPrompt, setSavedPrompt] = useState(loadCheatsheetPrompt)
  const [promptDraft, setPromptDraft] = useState(loadCheatsheetPrompt)
  const [promptStatus, setPromptStatus] = useState('')
  const [promptError, setPromptError] = useState('')
  const promptDirty = promptDraft.trim() !== savedPrompt
  const savePrompt = () => {
    try { const value = saveCheatsheetPrompt(promptDraft); setSavedPrompt(value); setPromptDraft(value); setPromptError(''); setPromptStatus('已保存，下次生成生效') }
    catch (e) { setPromptError(e.message); setPromptStatus('') }
  }
  const { task, draft: pendingDraft, results, cacheLoading, busy, status, progress, error: taskError } = generation
  const draft = generation.subject === subject ? pendingDraft : null
  const result = draft || results[subject]
  const [previewHTML, setPreviewHTML] = useState('')
  useEffect(() => {
    let active = true
    setPreviewHTML('')
    if (!result) return
    import('../lib/notebookPrint').then(({ notebookPrintHTML }) => {
      if (active) setPreviewHTML(notebookPrintHTML(result.notes, { sourceCount: result.sourceCount, generatedAt: result.createdAt, embedded: true }))
    }).catch(() => { if (active) setPreviewHTML('') })
    return () => { active = false }
  }, [result])
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  const ready = notes.filter(n => n.status === 'ready' && n.subject === subject)
  const chapterCount = new Set(ready.map(n => `${n.subject}:${n.chapter}`)).size
  const oldGeneration = result && result.generationVersion !== CHEATSHEET_GENERATION_VERSION
  const stale = result && (oldGeneration || result.fingerprint !== cheatsheetFingerprint(ready))
  const generate = () => {
    if (busy || pendingDraft || !ready.length || promptDirty) return
    setError('')
    task.start({ subject, notes: ready, effort, prompt: savedPrompt, modelConfig, returnUrl: window.location.href })
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
      <div className="cs-subject-picker">
        <div className="cs-subject-tabs" role="tablist" aria-label="小抄科目">
          {Object.keys(CHAPTERS).map((s, i) => <button key={s} id={`cs-subject-${i}`} type="button" role="tab" aria-label={s} aria-selected={subject === s} aria-controls="cs-subject-panel" tabIndex={subject === s ? 0 : -1}
            onClick={() => { setError(''); go('cheatsheet', { subject: s }) }} onKeyDown={e => {
              const subjects = Object.keys(CHAPTERS)
              const next = e.key === 'ArrowRight' ? (i + 1) % subjects.length : e.key === 'ArrowLeft' ? (i + subjects.length - 1) % subjects.length : e.key === 'Home' ? 0 : e.key === 'End' ? subjects.length - 1 : null
              if (next !== null) { e.preventDefault(); setError(''); go('cheatsheet', { subject: subjects[next] }); document.getElementById(`cs-subject-${next}`)?.focus() }
            }}><span>{s}</span><small>{generation.subject === s && busy ? '生成中' : generation.subject === s && pendingDraft ? '待保留' : results[s] ? '已保存' : '未生成'}</small></button>)}
        </div>
        <p>每科保留一份小抄，每次生成当前科目。</p>
      </div>
      <div className="cs-subject-panel" id="cs-subject-panel" role="tabpanel" aria-labelledby={`cs-subject-${Object.keys(CHAPTERS).indexOf(subject)}`} tabIndex={0}>
      {loading || cacheLoading ? <p className="cs-loading" role="status">正在读取笔记与上次结果…</p> : result ? <section className="cs-document" aria-label={draft ? '本次生成的小抄' : '上次生成的小抄'}>
        <div className="cs-document-top"><span className="cs-format">A4 <i /> 双栏 <i /> 三色笔</span><span className="cs-cache-state">{draft ? '待保留' : '本地已保存'}</span></div>
        <div className="cs-document-title"><span className="cs-file-icon"><Icon name="list" size={24} /></span><div><h2>{subject} · 复习小抄</h2><p>{result.sourceCount} 条笔记，提炼为 <strong>{result.notes.length}</strong> 个考点</p></div></div>
        <div className="cs-document-bottom"><time>{new Date(result.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} 生成</time><span className="cs-export-formats">PDF / HTML</span></div>
        <details className="cs-inline-preview" open><summary>版面预览 <span>A4 等比缩放</span></summary>{previewHTML && <iframe title="小抄版面预览" sandbox="allow-scripts" srcDoc={previewHTML} />}</details>
        <button className="btn-pri cs-preview" disabled={opening} onClick={openPreview}>{opening ? '正在打开…' : '查看 / 打印'} <Icon name="chevronRight" size={16} /></button>
        {!!result.notes.flatMap(n => n.reviewNotes || []).length && <details className="cs-review"><summary>{result.notes.flatMap(n => n.reviewNotes || []).length} 项待核对</summary><ul>{result.notes.flatMap(n => (n.reviewNotes || []).map((text, i) => <li key={`${n.id}-${i}`}><strong>{n.title}</strong>：{text}</li>))}</ul></details>}
        {stale && <p className="cs-update-hint"><span />{oldGeneration ? '生成规则已升级，重新生成可按知识图谱聚合与排序' : '笔记有更新，可在下方重新生成'}</p>}
        <details className="cs-contents"><summary>知识结构 <span>{result.notes.length}<Icon name="chevronRight" size={14} /></span></summary><ol>{result.notes.map(n => <li key={n.id}>{n.section && <small className="cs-section-label">{n.section} · </small>}{n.title}</li>)}</ol></details>
      </section> : <section className="cs-intro"><span className="cs-format">A4 <i /> 双栏 <i /> 三色笔</span><h2>把零散笔记，整理成知识脉络</h2><p>参考知识图谱聚合与排序，聚合同类知识，保留完整图文、公式与必要示例。</p></section>}
      <section className="cs-generation" aria-label="生成设置">
        <div className="cs-generation-heading"><h2><Icon name="sparkle" size={16} />{result ? '更新小抄' : '生成小抄'}</h2><span>{ready.length} 条精华 · {chapterCount} 章</span></div>
        <div className="cs-generation-controls"><label className="cs-model-select"><span>模型</span><select aria-label="小抄生成模型" value={provider} disabled={busy || loading || cacheLoading} onChange={e => selectProvider(e.target.value)}>
          <option value="">跟随默认 · {getCfg(modelStore).model}</option>
          {Object.entries(PRESETS).map(([id, preset]) => {
            const config = getCfg({ ...modelStore, active: id })
            return <option key={id} value={id} disabled={!config.key}>{preset.label} · {config.model}{!config.key ? '（未配置）' : ''}</option>
          })}
        </select></label><label><span>Thinking</span><select aria-label="Cheatsheet thinking depth" value={effort} disabled={busy || loading || cacheLoading} onChange={e => setEffort(e.target.value)}>{levels.map(level => <option key={level} value={level}>{level.toUpperCase()}</option>)}</select></label>
          {busy ? <button className="cs-cancel" disabled={status === 'saving'} onClick={task.cancel}>{status === 'saving' ? '正在保留…' : '取消生成'}</button> : <button className={result ? 'cs-regenerate' : 'btn-pri cs-generate'} disabled={loading || cacheLoading || !!pendingDraft || !ready.length || !!notesError || promptDirty} onClick={generate}>{result ? '重新生成' : '生成小抄'}<Icon name={result ? 'refresh' : 'sparkle'} size={15} /></button>}
        </div>
        <details className="cs-prompt-editor"><summary>生成 Prompt <span>{promptDirty ? '未保存' : savedPrompt === DEFAULT_CHEATSHEET_PROMPT ? '默认' : '自定义'}<Icon name="chevronRight" size={14} /></span></summary>
          <p>调整提炼规则与表达方式。知识图谱结构、笔记资料和覆盖校验由系统自动附加。</p>
          <textarea aria-label="小抄生成 Prompt" value={promptDraft} disabled={busy} maxLength={20000} onChange={e => { setPromptDraft(e.target.value); setPromptStatus(''); setPromptError('') }} spellCheck={false} />
          <div className="cs-prompt-actions"><button type="button" disabled={busy || !promptDirty || !promptDraft.trim()} onClick={savePrompt}>保存 Prompt</button><button type="button" disabled={busy} onClick={() => { setPromptDraft(DEFAULT_CHEATSHEET_PROMPT); setPromptStatus('默认规则已填入，保存后生效'); setPromptError('') }}>恢复默认</button>{promptDirty && <button type="button" disabled={busy} onClick={() => { setPromptDraft(savedPrompt); setPromptStatus(''); setPromptError('') }}>取消修改</button>}</div>
          {promptStatus && <p role="status">{promptStatus}</p>}{promptError && <p role="alert" className="nb-error">{promptError}</p>}
        </details>
        {promptDirty && <p className="cs-generation-note">Prompt 有未保存修改，请先保存或取消修改后生成。</p>}
        {busy ? <div className="cs-progress">
          <ChatLoading mode={generation.effort === 'off' ? '' : generation.effort.toUpperCase()} retrying={progress?.retrying} received={progress?.received || 0} context="参考知识图谱规划顺序，再按组整理图文与检查覆盖。" completion="完成并校验后，可预览并选择保留。" />
          <p role="status">{progress ? `第 ${progress.current} 步 · ${progress.chapter}` : `${generation.subject} · 正在准备…`}</p>
          <small>正在生成{generation.subject}的小抄。切换科目或页面后会继续生成。</small>
        </div> : <p className="cs-generation-note">{!loading && !ready.length ? `先在笔记本保存至少一条${subject}的章节精华。` : `仅使用${subject}的全部章节精华；保留后只更新本科目的小抄。`}</p>}
        {pendingDraft && <p className="cs-generation-note">{generation.subject}的小抄已生成，请先通过悬浮条保留或丢弃，再生成下一份。各科目已保存的小抄仍保留。</p>}
        {(error || taskError || notesError) && <p className="nb-error" role="alert">{error || taskError || notesError}</p>}
        {!modelConfig.key && <button className="btn-sm btn-ghost" onClick={() => go('data', { page: 'ai' })}>配置 AI 模型</button>}
      </section>
      </div>
    </div>
  </>
}
