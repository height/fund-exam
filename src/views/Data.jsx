import { useEffect, useRef, useState } from 'react'
import { Icon } from '../components/ui'
import { PRESETS, loadStore, pingAI, provDefault, saveStore } from '../lib/ai'
import { BANK } from '../lib/bank'
import { idb, kvSet } from '../lib/db'
import { THEMES, useStore } from '../lib/store'

export default function Data() {
  const { records, setRecords, theme, setTheme, toast, ask } = useStore()
  const [exams, setExams] = useState([])
  const [ai, setAi] = useState(loadStore)
  const [testing, setTesting] = useState(false)
  const [showKey, setShowKey] = useState(false)
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
        <div className="muted">答错题时可以让 AI 换个讲法。两家可以都配好，选中的 tab 就是默认模型；配置和 Key 只存本机浏览器，与做题记录分开，只发给下面这个接口。</div>
        <div className="seg">
          {Object.entries(PRESETS).map(([k, p]) => (
            <button key={k} className={ai.active === k ? 'on' : ''}
              onClick={() => switchAi(k)}>
              {p.label}{ai.active === k && <small>✓ 默认</small>}
            </button>
          ))}
        </div>
        <label className="ai-field">接口地址
          <input value={cur.url} onChange={e => editAi({ url: e.target.value })} />
        </label>
        <label className="ai-field">模型名称
          <input value={cur.model} onChange={e => editAi({ model: e.target.value })} />
        </label>
        <label className="ai-field">API Key
          <div className="row">
            <input className="grow" type={showKey ? 'text' : 'password'} placeholder="sk-…"
              value={cur.key} onChange={e => editAi({ key: e.target.value })} />
            <button type="button" className="btn-sm btn-ghost" onClick={() => setShowKey(s => !s)}
              aria-label={showKey ? '隐藏 Key' : '显示 Key'} aria-pressed={showKey}>
              <Icon name={showKey ? 'eyeOff' : 'eye'} />
            </button>
          </div>
        </label>
        <button className="btn-pri" disabled={testing} onClick={saveAi}>
          {testing ? '正在试调用…' : '保存并测试'}
        </button>
      </div>

      <div className="card">
        <h2>语音朗读</h2>
        <div className="muted">MiMo TTS 的 Key，用来朗读题目和 AI 解析。输入即存，只存本机浏览器。</div>
        <label className="ai-field">语音 API Key
          <input type="password" placeholder="sk-…" defaultValue={loadStore().ttsKey || ''}
            onChange={e => saveStore({ ...loadStore(), ttsKey: e.target.value.trim() })} />
        </label>
      </div>

      <div className="card">
        <h2>进度备份</h2>
        <div className="muted">换手机、换浏览器或清缓存之前，先导出一份。</div>
        <div className="grid2">
          <button className="btn-pri" onClick={exportAll}>导出进度</button>
          <button onClick={() => fileRef.current.click()}>导入进度</button>
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
        <button className="btn-danger btn-ghost" onClick={reset}>清空全部进度</button>
        <div className="muted">删除做题记录、错题本和考试成绩，题库不受影响。</div>
      </div>
    </>
  )
}
