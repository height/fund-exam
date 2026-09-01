import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/ui'
import { PRESETS, TTS_SPEEDS, getTtsSpeed, loadStore, pingAI, provDefault, saveStore, setTtsSpeed } from '../lib/ai'
import { analyticsConfigured, getAnalyticsEnabled, setAnalyticsEnabled, track } from '../lib/analytics'
import { BANK } from '../lib/bank'
import { idb, kvSet } from '../lib/db'
import { THEMES, useStore } from '../lib/store'

/** 带小眼睛的 Key 输入。AI 和语音两处共用，别各写一遍 */
function KeyField({ label, value, onChange }) {
  const [show, setShow] = useState(false)
  return (
    <label className="ai-field">{label}
      <div className="row">
        <input className="grow" type={show ? 'text' : 'password'} placeholder="sk-…"
          value={value} onChange={e => onChange(e.target.value)} />
        <button type="button" className="btn-sm btn-ghost" onClick={() => setShow(s => !s)}
          aria-label={show ? '隐藏 Key' : '显示 Key'} aria-pressed={show}>
          <Icon name={show ? 'eyeOff' : 'eye'} />
        </button>
      </div>
    </label>
  )
}

export default function Data() {
  const { records, setRecords, theme, setTheme, toast, ask } = useStore()
  const [exams, setExams] = useState([])
  const [ai, setAi] = useState(loadStore)
  const [testing, setTesting] = useState(false)
  const [ttsKey, setTtsKey] = useState(() => loadStore().ttsKey || '')
  const [speed, setSpeed] = useState(getTtsSpeed)
  const [anonymousAnalytics, setAnonymousAnalytics] = useState(() => analyticsConfigured && getAnalyticsEnabled())
  const fileRef = useRef(null)

  // 两家各存一份，tab 就是默认模型开关：一点立即生效并记住
  const cur = { ...provDefault(ai.active), ...ai.providers[ai.active] }
  const switchAi = k => {
    setAi(s => ({ ...s, active: k }))
    saveStore({ ...loadStore(), active: k }) // 只持久化默认指向，编辑中的字段仍等「保存并测试」
  }
  // 字段编辑只动本地状态；「保存并测试」真调一次接口，调通了才落盘
  const editAi = patch =>
    setAi(s => ({ ...s, providers: { ...s.providers, [s.active]: { ...cur, ...patch } } }))
  async function saveAi() {
    setTesting(true)
    try {
      await pingAI(cur)
      saveStore({ ...loadStore(), active: ai.active, providers: { ...loadStore().providers, [ai.active]: cur } })
      toast('调用成功，配置已保存')
    } catch (e) {
      toast(`保存失败：${e.message}`)
    }
    setTesting(false)
  }

  const reload = () => idb.all('exams').then(setExams)
  useEffect(() => { reload() }, [])

  async function exportAll() {
    const data = {
      app: 'fund-quiz', version: 1, exportedAt: new Date().toISOString(),
      records: Object.values(records), exams: await idb.all('exams'), kv: await idb.all('kv'),
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
    a.download = `基金刷题进度_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('已导出到下载目录')
    track('progress_exported')
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
      let next = merge ? { ...records } : {}
      if (!merge) { await idb.clear('records'); await idb.clear('exams') }
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
      body: '做题记录、错题本和考试成绩都会删掉，找不回来。题库不受影响。',
      ok: '清空', cancel: '再想想', danger: true,
    })) return
    await idb.clear('records')
    await idb.clear('exams')
    await kvSet('activeExam', null)
    setRecords({})
    reload()
    toast('已清空')
    track('progress_reset')
  }

  return (
    <>
      <div>
        <h1>设置</h1>
        <div className="muted">配置和进度只存在这台设备的浏览器里</div>
      </div>

      <div className="card">
        <h2>外观</h2>
        <div className="seg">
          {THEMES.map(([v, t]) => (
            <button key={v} className={theme === v ? 'on' : ''} onClick={() => setTheme(v)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>AI 解析</h2>
        <div className="muted">答错题时可以让 AI 换个讲法。几家可以都配好，各存各的 Key，下拉选中的就是默认模型；配置和 Key 只存本机浏览器，与做题记录分开，只发给下面这个接口。</div>
        {/* 用下拉不用 tab：厂商还会加，三个以上横排就挤成一行看不清的小字 */}
        <label className="ai-field">默认模型
          <select value={ai.active} onChange={e => switchAi(e.target.value)}>
            {Object.entries(PRESETS).map(([k, p]) => (
              <option key={k} value={k}>
                {p.label}{ai.providers?.[k]?.key ? ' · 已配' : ' · 未配 Key'}
              </option>
            ))}
          </select>
        </label>
        <label className="ai-field">接口地址
          <input value={cur.url} onChange={e => editAi({ url: e.target.value })} />
        </label>
        <label className="ai-field">模型名称
          <input value={cur.model} onChange={e => editAi({ model: e.target.value })} />
        </label>
        <KeyField label="API Key" value={cur.key} onChange={v => editAi({ key: v })} />
        <button className="btn-pri" disabled={testing} onClick={saveAi}>
          {testing ? '正在试调用…' : '保存并测试'}
        </button>
      </div>

      <div className="card">
        <h2>语音朗读</h2>
        <div className="muted">MiMo TTS 的 Key，用来朗读题目和 AI 解析。输入即存，只存本机浏览器。</div>
        <KeyField label="语音 API Key" value={ttsKey}
          onChange={v => { setTtsKey(v); saveStore({ ...loadStore(), ttsKey: v.trim() }) }} />
        <label className="row between">
          <span>朗读语速
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>
              提速不变调；正在播的会立刻跟上
            </span>
          </span>
          <span className="seg seg-n">
            {TTS_SPEEDS.map(v => (
              <button key={v} className={speed === v ? 'on' : ''}
                onClick={() => { setSpeed(v); setTtsSpeed(v) }}>{v === 1 ? '1×' : `${v}×`}</button>
            ))}
          </span>
        </label>
      </div>

      <div className="card">
        <h2>隐私</h2>
        <label className="row between" style={{ cursor: 'pointer' }}>
          <span>匿名使用统计
            <span className="muted" style={{ display: 'block', fontSize: 12 }}>
              仅统计页面和功能使用，不上传题目、答案、成绩或 API Key
            </span>
          </span>
          <input type="checkbox" checked={anonymousAnalytics}
            disabled={!analyticsConfigured}
            onChange={e => {
              const enabled = e.target.checked
              setAnonymousAnalytics(enabled)
              setAnalyticsEnabled(enabled)
              toast(enabled ? '已开启匿名统计' : '已关闭匿名统计')
            }}
            style={{ width: 20, height: 20, accentColor: 'var(--accent)' }} />
        </label>
        {!analyticsConfigured && <div className="muted">当前构建未配置统计服务，不会发送任何数据。</div>}
      </div>

      <div className="card">
        <h2>进度备份</h2>
        <div className="muted">换手机、换浏览器或清缓存之前，先导出一份。</div>
        <div className="grid2">
          <button className="btn-pri" onClick={exportAll}><Icon name="download" /> 导出进度</button>
          <button onClick={() => fileRef.current.click()}><Icon name="upload" /> 导入进度</button>
        </div>
        <input type="file" ref={fileRef} accept="application/json" hidden onChange={importFile} />
      </div>

      <div className="card">
        <h2>当前存量</h2>
        <div className="list">
          <div className="list-item"><span className="grow">题库</span><b className="num">{BANK.length}</b></div>
          <div className="list-item"><span className="grow">做过的题</span><b className="num">{Object.keys(records).length}</b></div>
          <div className="list-item"><span className="grow">考试记录</span><b className="num">{exams.length}</b></div>
        </div>
      </div>

      <div className="card">
        <button className="btn-danger btn-ghost" onClick={reset}><Icon name="trash" /> 清空全部进度</button>
        <div className="muted">删除做题记录、错题本和考试成绩，题库不受影响。</div>
      </div>
    </>
  )
}
