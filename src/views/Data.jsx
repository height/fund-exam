import { useEffect, useId, useRef, useState } from 'react'
import { Icon, PageHeader, Speaker } from '../components/ui'
import { PRESETS, TTS_SPEEDS, TTS_VOICES, TTS_STYLES, getTtsSpeed, getTtsVoice, getTtsStyle,
  loadStore, pingAI, provDefault, saveStore, setTtsSpeed, setTtsVoice, setTtsStyle } from '../lib/ai'
import { track } from '../lib/analytics'
import { BANK } from '../lib/bank'
import { idb, kvSet } from '../lib/db'
import { THEMES, useStore } from '../lib/store'
import { FORMULA_LESSONS, FORMULA_MASTERY_KEY } from '../data/formulaLessons'
import { FORMULA_PROGRESS_KEY, emptyProgress, mergeProgress } from '../lib/formulaProgress'
import { loadFormulaProgress, saveFormulaProgress } from '../lib/formulaStorage'

function getFormulaMastery() {
  try {
    const value = JSON.parse(localStorage.getItem(FORMULA_MASTERY_KEY) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

/** 带小眼睛的 Key 输入。AI 和语音两处共用，别各写一遍 */
function KeyField({ label, value, onChange, disabled = false }) {
  const [show, setShow] = useState(false)
  const id = useId()
  return (
    <div className="ai-field">
      <label htmlFor={id}>{label}</label>
      <div className="settings-key">
        <input id={id} type={show ? 'text' : 'password'} placeholder="粘贴 API Key"
          disabled={disabled} autoComplete="off" autoCapitalize="none" spellCheck={false}
          value={value} onChange={e => onChange(e.target.value)} />
        <button type="button" className="btn-sm btn-ghost" onClick={() => setShow(s => !s)}
          aria-label={show ? '隐藏 Key' : '显示 Key'} aria-pressed={show}>
          <Icon name={show ? 'eyeOff' : 'eye'} />
        </button>
      </div>
    </div>
  )
}

function SettingsLink({ icon, title, detail, status, onClick }) {
  return <button className="settings-link" onClick={onClick}>
    <span className="settings-link-icon"><Icon name={icon} /></span>
    <span className="settings-link-copy"><strong>{title}</strong><small>{detail}</small></span>
    {status && <span className="settings-link-status">{status}</span>}
    <Icon name="right" />
  </button>
}

function SettingsSelect({ label, inline = false, children, ...props }) {
  const id = useId()
  return <div className={`ai-field ${inline ? 'settings-inline-field' : ''}`}>
    <label htmlFor={id}>{label}</label>
    <span className="settings-select">
      <select id={id} {...props}>{children}</select>
      <Icon name="back" />
    </span>
  </div>
}

const PAGES = { ai: 'AI 解析', voice: '语音朗读', storage: '数据与备份' }

export default function Data({ go, page }) {
  const { records, setRecords, theme, setTheme, toast, ask } = useStore()
  const [exams, setExams] = useState([])
  const [ai, setAi] = useState(loadStore)
  const [testing, setTesting] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [ttsKey, setTtsKey] = useState(() => loadStore().ttsKey || '')
  const [speed, setSpeed] = useState(getTtsSpeed)
  const [voice, setVoice] = useState(getTtsVoice)
  const [style, setStyle] = useState(getTtsStyle)
  const fileRef = useRef(null)
  const currentPage = Object.hasOwn(PAGES, page) ? page : null
  const selectedVoice = TTS_VOICES.find(v => v.id === voice)
  const savedAi = loadStore()
  const open = next => go('data', next ? { page: next } : {})

  useEffect(() => { window.scrollTo(0, 0) }, [currentPage])

  // 每家独立保留配置；默认服务即时生效，编辑字段通过测试后保存。
  const active = Object.hasOwn(PRESETS, ai.active) ? ai.active : 'deepseek'
  const cur = { ...provDefault(active), ...ai.providers?.[active] }
  const switchAi = k => {
    setAiResult(null)
    setAi(s => ({ ...s, active: k }))
    saveStore({ ...loadStore(), active: k }) // 只持久化默认指向，编辑中的字段仍等「保存并测试」
  }
  // 字段编辑只动本地状态；「保存并测试」真调一次接口，调通了才落盘
  const editAi = patch => {
    setAiResult(null)
    setAi(s => ({ ...s, active, providers: { ...s.providers, [active]: { ...cur, ...patch } } }))
  }
  async function saveAi() {
    setTesting(true)
    setAiResult(null)
    try {
      await pingAI(cur)
      saveStore({ ...loadStore(), active, providers: { ...loadStore().providers, [active]: cur } })
      setAiResult({ ok: true, message: '连接成功，配置已保存。' })
      toast('调用成功，配置已保存')
    } catch (e) {
      setAiResult({ ok: false, message: `保存失败：${e.message}` })
      toast(`保存失败：${e.message}`)
    }
    setTesting(false)
  }

  const reload = () => idb.all('exams').then(setExams)
  useEffect(() => { reload() }, [])

  async function exportAll() {
    try {
      const formulaProgress = await loadFormulaProgress()
      const data = {
        app: 'fund-quiz', version: 1, exportedAt: new Date().toISOString(),
        records: Object.values(records), exams: await idb.all('exams'), kv: await idb.all('kv'),
        formulaMastery: getFormulaMastery(),
        formulaProgress,
      }
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
      a.download = `基金刷题进度_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(a.href)
      toast('已导出到下载目录')
      track('progress_exported')
    } catch (err) { toast(`导出失败：${err.message}`) }
  }

  async function importFile(e) {
    const f = e.target.files[0]
    if (!f) return
    try {
      const d = JSON.parse(await f.text())
      if (d.app !== 'fund-quiz') throw new Error('这不是本应用导出的文件')
      // 三态：覆盖 / 合并 / 什么都不做（点外面或 Esc）
      const overwrite = await ask({
        title: '导入进度',
        body: `文件里有 ${(d.records || []).length} 条做题记录。与现有进度合并，还是清空后覆盖？`,
        ok: '清空后覆盖', cancel: '合并', danger: true,
      })
      if (overwrite === null) { e.target.value = ''; return }
      const merge = !overwrite
      const incomingProgress = d.formulaProgress ?? (Array.isArray(d.kv) ? d.kv.find(row => row.k === FORMULA_PROGRESS_KEY)?.v : null)
      if (incomingProgress && incomingProgress.version !== 1) throw new Error('此微课堂记录版本暂不支持，请更新应用后重试')
      const nextProgress = mergeProgress(await loadFormulaProgress(), incomingProgress, !merge)
      let next = merge ? { ...records } : {}
      if (!merge) { await idb.clear('records'); await idb.clear('exams') }
      const oldFormula = merge ? getFormulaMastery() : []
      const incomingFormula = Array.isArray(d.formulaMastery) ? d.formulaMastery : []
      const nextFormula = [...new Set([...oldFormula, ...incomingFormula])]
      localStorage.setItem(FORMULA_MASTERY_KEY, JSON.stringify(nextFormula))
      for (const r of d.records || []) {
        const old = next[r.qid]
        next[r.qid] = old
          ? {
              ...r,
              seen: old.seen + r.seen, right: old.right + r.right, wrong: old.wrong + r.wrong,
              wrongFlag: (old.lastTs || 0) > (r.lastTs || 0) ? old.wrongFlag : r.wrongFlag,
              lastTs: Math.max(old.lastTs || 0, r.lastTs || 0),
            }
          : r
        await idb.put('records', next[r.qid])
      }
      for (const x of d.exams || []) await idb.put('exams', x)
      await saveFormulaProgress(nextProgress)
      setRecords(next)
      reload()
      toast(`导入成功，${(d.records || []).length} 条做题记录`)
      track('progress_imported', { import_mode: merge ? 'merge' : 'overwrite' })
    } catch (err) {
      await ask({ title: '导入失败', body: `${err.message}。请选择本应用导出的 JSON 文件。`, ok: '知道了' })
    }
    e.target.value = ''
  }

  async function reset() {
    if (!await ask({
      title: '清空全部进度？',
      body: '做题记录、错题本、考试成绩和公式掌握进度都会删掉，找不回来。题库不受影响。',
      ok: '清空', cancel: '再想想', danger: true,
    })) return
    await idb.clear('records')
    await idb.clear('exams')
    await kvSet('activeExam', null)
    await saveFormulaProgress(emptyProgress())
    localStorage.removeItem(FORMULA_MASTERY_KEY)
    setRecords({})
    reload()
    toast('已清空')
    track('progress_reset')
  }

  return (
    <div className="settings">
      <PageHeader title={PAGES[currentPage] || '设置'}
        subtitle={currentPage ? undefined : '按你的习惯，调整学习体验'}
        variant={currentPage ? 'subpage' : 'tab'}
        onBack={currentPage ? () => open(null) : undefined} backLabel="设置" />

      {!currentPage && <>
        <section className="settings-section">
          <h2>外观</h2>
          <div className="seg settings-theme" aria-label="外观主题">
            {THEMES.map(([v, t]) => <button key={v} aria-pressed={theme === v}
              className={theme === v ? 'on' : ''} onClick={() => setTheme(v)}>{t}</button>)}
          </div>
        </section>
        <section className="settings-section">
          <h2>学习助手</h2>
          <div className="settings-links">
            <SettingsLink icon="sparkle" title="AI 解析" detail={`${PRESETS[active].label} · 答疑与解题讲解`}
              status={savedAi.providers?.[active]?.key ? '已配置' : '待配置'} onClick={() => open('ai')} />
            <SettingsLink icon="volume" title="语音朗读" detail={`${selectedVoice.name} · ${speed}× · ${TTS_STYLES.find(s => s.id === style).name}`}
              status={ttsKey.trim() ? '已配置' : '待配置'} onClick={() => open('voice')} />
          </div>
        </section>
        <section className="settings-section">
          <h2>学习数据</h2>
          <div className="settings-links">
            <SettingsLink icon="download" title="数据与备份"
              detail={`已练 ${Object.keys(records).length} 题 · ${exams.length} 次考试`} onClick={() => open('storage')} />
          </div>
          <p className="settings-note">进度和配置保存在当前浏览器，换设备前记得备份。</p>
        </section>
      </>}

      {currentPage === 'ai' && <>
        <section className="settings-section">
          <h2>默认服务</h2>
          <SettingsSelect label="AI 服务" value={active} disabled={testing} onChange={e => switchAi(e.target.value)}>
              {Object.entries(PRESETS).map(([k, p]) => <option key={k} value={k}>
                {p.label}{savedAi.providers?.[k]?.key ? ' · 已配置' : ' · 未配置'}
              </option>)}
          </SettingsSelect>
          <p className="settings-note">每家服务独立保存配置，选中的服务用于题目解析和答疑。</p>
        </section>
        <form className="settings-section" onSubmit={e => { e.preventDefault(); saveAi() }}
          onInvalidCapture={e => e.target.closest('details')?.setAttribute('open', '')}>
          <h2>{PRESETS[active].label} 配置</h2>
          <KeyField label="API Key" value={cur.key || ''} disabled={testing}
            onChange={v => editAi({ key: v.trim() })} />
          <details className="settings-advanced">
            <summary>接口与模型<span>{cur.model}</span><Icon name="right" /></summary>
            <div className="settings-advanced-fields">
              <label className="ai-field">接口地址
                <input type="url" required disabled={testing} autoCapitalize="none" spellCheck={false}
                  value={cur.url} onChange={e => editAi({ url: e.target.value.trim() })} />
              </label>
              <label className="ai-field">模型名称
                <input required disabled={testing} autoCapitalize="none" spellCheck={false}
                  value={cur.model} onChange={e => editAi({ model: e.target.value })} />
              </label>
            </div>
          </details>
          <div className="settings-actions">
            <button type="submit" className="btn-pri" disabled={testing || !cur.key?.trim() || !cur.url?.trim() || !cur.model?.trim()}>
              {testing && <Icon name="loader" />}{testing ? '正在测试…' : '保存并测试'}
            </button>
            <span className="settings-note">连接成功后保存</span>
          </div>
          {aiResult && <p role="status" className={`settings-feedback ${aiResult.ok ? '' : 'is-error'}`}>{aiResult.message}</p>}
        </form>
        <p className="settings-note">Key 仅保存在本机浏览器，只发送给配置的接口地址。</p>
      </>}

      {currentPage === 'voice' && <>
        <section className="settings-section">
          <div className="settings-section-heading"><h2>朗读服务</h2>
            <a className="settings-text-link" href="https://platform.xiaomimimo.com/console/api-keys"
              target="_blank" rel="noopener noreferrer" aria-label="申请 MiMo API Key（在新标签页打开）">
              申请 MiMo API Key <span aria-hidden="true">↗</span>
            </a>
          </div>
          <KeyField label="MiMo API Key" value={ttsKey}
            onChange={v => { setTtsKey(v); saveStore({ ...loadStore(), ttsKey: v.trim() }) }} />
          <p className="settings-note">仅支持 MiMo TTS，当前限时免费。Key 仅保存在本机。</p>
        </section>
        <section className="settings-section">
          <h2>音色与试听</h2>
          <SettingsSelect label="朗读音色" inline value={voice} onChange={e => { setVoice(e.target.value); setTtsVoice(e.target.value) }}>
              {[['zh', '中文'], ['en', '英文']].map(([language, label]) =>
                <optgroup key={language} label={label}>
                  {TTS_VOICES.filter(v => v.language === language).map(v =>
                    <option key={v.id} value={v.id}>{v.name} · {v.detail}</option>)}
                </optgroup>)}
          </SettingsSelect>
          <div className="settings-preview">
            <div><strong>{selectedVoice.name}</strong><span>{ttsKey.trim() ? `${speed}× · 试听当前配置` : '填写 MiMo Key 后即可试听'}</span></div>
            <Speaker key={`${voice}:${style}:${ttsKey}`} label="试听音色" showLabel disabled={!ttsKey.trim()}
              getText={() => selectedVoice.language === 'en'
                ? 'Let’s learn step by step. Understand the question, then choose your answer.'
                : '学习不必着急。读懂每一道题，让知识一点点积累。'} />
          </div>
        </section>
        <section className="settings-section">
          <h2>朗读偏好</h2>
          <SettingsSelect label="朗读风格" inline value={style} onChange={e => { setStyle(e.target.value); setTtsStyle(e.target.value) }}>
              {TTS_STYLES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </SettingsSelect>
          <div className="settings-speed">
            <span className="settings-field-label">朗读语速</span>
            <div className="seg seg-n" aria-label="朗读语速">
              {TTS_SPEEDS.map(v => <button key={v} aria-pressed={speed === v} className={speed === v ? 'on' : ''}
                onClick={() => { setSpeed(v); setTtsSpeed(v) }}>{v}×</button>)}
            </div>
          </div>
          <p className="settings-note">提速不变调，音色与风格用于下一次朗读。</p>
        </section>
      </>}

      {currentPage === 'storage' && <>
        <section className="settings-section">
          <h2>进度备份</h2>
          <p className="settings-note">换手机、换浏览器或清缓存前，先导出一份进度。</p>
          <div className="settings-actions">
            <button className="btn-pri" onClick={exportAll}><Icon name="download" />导出进度</button>
            <button onClick={() => fileRef.current.click()}><Icon name="upload" />导入进度</button>
          </div>
          <input type="file" ref={fileRef} accept="application/json" hidden onChange={importFile} />
          <p className="settings-note">备份包含学习记录，不包含 AI 和语音 Key。导入时可选择合并或覆盖。</p>
        </section>
        <section className="settings-section">
          <h2>当前存量</h2>
          <div className="list settings-data-list">
            <div className="list-item"><span className="grow">题库</span><b className="num">{BANK.length}</b></div>
            <div className="list-item"><span className="grow">做过的题</span><b className="num">{Object.keys(records).length}</b></div>
            <div className="list-item"><span className="grow">考试记录</span><b className="num">{exams.length}</b></div>
            <div className="list-item"><span className="grow">旧公式历史记录</span><b className="num">{getFormulaMastery().length}/{FORMULA_LESSONS.length}</b></div>
          </div>
        </section>
        <section className="settings-section settings-danger">
          <h2>重置数据</h2>
          <p className="settings-note">删除做题记录、错题本、考试成绩和公式掌握进度，题库不受影响。</p>
          <div className="settings-actions"><button className="btn-danger btn-ghost" onClick={reset}><Icon name="trash" />清空全部进度</button></div>
        </section>
      </>}
    </div>
  )
}
