/* 几个视图里反复出现的小块 */
import { useEffect, useRef, useState } from 'react'
import { askAI, getCfg, getKey, mdToSpeech, setKey, speak, stopSpeak } from '../lib/ai'
import { SUBJECTS, SUBJ_SHORT, stats } from '../lib/bank'
import { ExplainBody, Md, Plain } from '../lib/format'
import { useStore } from '../lib/store'

/** 内联 SVG 图标，路径来自 Lucide/Feather（ISC 协议）。不装图标包，用到哪个抄哪个 */
const ICONS = {
  volume: ['M11 5 6 9H3v6h3l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M18.6 5.4a9.5 9.5 0 0 1 0 13.2'],
  stop: ['M7 7h10v10H7z'],
  loader: ['M21 12a9 9 0 1 1-6.2-8.6'],
  eye: ['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z'],
  eyeOff: ['M17.9 17.9A10 10 0 0 1 2 12s1.6-3 4.1-4.9', 'M9.9 4.2A10.6 10.6 0 0 1 12 4c6.4 0 10 8 10 8a17.6 17.6 0 0 1-2.2 3.2', 'M14.1 14.1a3 3 0 1 1-4.2-4.2', 'M2 2l20 20'],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 3v6h-6'],
  sparkle: ['M12 3l1.9 5.7a2 2 0 0 0 1.4 1.4L21 12l-5.7 1.9a2 2 0 0 0-1.4 1.4L12 21l-1.9-5.7a2 2 0 0 0-1.4-1.4L3 12l5.7-1.9a2 2 0 0 0 1.4-1.4z'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  sun: ['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 2v2', 'M12 20v2', 'M2 12h2', 'M20 12h2', 'M4.9 4.9l1.4 1.4', 'M17.7 17.7l1.4 1.4', 'M4.9 19.1l1.4-1.4', 'M17.7 6.3l1.4-1.4'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  play: ['M7 5l12 7-12 7z'],
}

/**
 * 图标尺寸跟着所在按钮的字号走（CSS 里 1.15em），不再每个调用点手填一个数字——
 * 之前 11/12/13/14/15 五种尺寸并存，对齐只能靠 vertical-align 的魔法偏移，换一组就歪。
 * size 仅在确实要脱离字号时才传。
 */
export function Icon({ name, size }) {
  return (
    <svg className={`icon i-${name}`} viewBox="0 0 24 24" aria-hidden="true"
      style={size ? { width: size, height: size } : undefined}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name].map(d => <path key={d} d={d} />)}
    </svg>
  )
}

/**
 * 应用内确认框。挂在 App 顶层，由 store.ask() 驱动。
 * 打开时焦点移到主按钮，Esc 取消——原生 confirm 白送的两件事得自己补回来。
 * 三态返回：主按钮 true、次按钮 false、点外面或 Esc 是 null（= 什么都别做）。
 * 这样「合并 / 覆盖 / 取消」这类三选一不用叠第二个弹层。
 */
export function Dialog() {
  const { dialog } = useStore()
  const okRef = useRef(null)

  useEffect(() => {
    if (!dialog) return
    okRef.current?.focus()
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); dialog.resolve(null) } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [dialog])

  if (!dialog) return null
  const { title, body, ok = '确定', cancel, danger, resolve } = dialog
  return (
    <div className="overlay center" role="dialog" aria-modal="true" aria-label={title}
      onClick={e => { if (e.target === e.currentTarget) resolve(null) }}>
      <div className="panel">
        <div>
          <b className="dialog-title">{title}</b>
          {body && <div className="muted" style={{ marginTop: 6 }}>{body}</div>}
        </div>
        <div className={cancel ? 'grid2' : ''}>
          {cancel && <button onClick={() => resolve(false)}>{cancel}</button>}
          <button ref={okRef} className={danger ? 'btn-danger' : 'btn-pri'}
            onClick={() => resolve(true)}>{ok}</button>
        </div>
      </div>
    </div>
  )
}

export function SubjectSeg() {
  const { records, subject, setSubject } = useStore()
  return (
    <div className="seg" role="tablist">
      {SUBJECTS.map(s => {
        const st = stats(records, s)
        return (
          <button key={s} role="tab" aria-selected={s === subject}
            aria-label={`${s} ${SUBJ_SHORT[s]}，共 ${st.total} 题`}
            className={s === subject ? 'on' : ''} onClick={() => setSubject(s)}>
            {s}<small>{SUBJ_SHORT[s]}</small>
          </button>
        )
      })}
    </div>
  )
}

export function ThemeToggle() {
  const { isDark, setTheme } = useStore()
  const label = `切换到${isDark ? '浅色' : '深色'}主题`
  return (
    <button className="btn-sm btn-ghost" aria-label={label} title={label}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}>
      {isDark ? <><Icon name="sun" /> 浅色</> : <><Icon name="moon" /> 深色</>}
    </button>
  )
}

/**
 * 选项列表。picked / answer 都给了就是「已揭晓」状态：对的标绿、选错的标红。
 * onPick 为空时渲染成不可点的 div（回顾场景）。
 */
export function Options({ q, picked, reveal, selected, onPick }) {
  return (
    <div className="opts">
      {q.options.map((o, i) => {
        let cls = 'opt'
        if (reveal) {
          if (i === q.answer) cls += ' ok'
          else if (i === picked) cls += ' bad'
        } else if (selected === i) cls += ' sel'
        const inner = <><em>{'ABCD'[i]}</em><span>{o}</span></>
        return onPick
          ? <button className={cls} key={i} data-pick={i} disabled={reveal}
              onClick={() => onPick(i)}>{inner}</button>
          : <div className={cls} key={i}>{inner}</div>
      })}
    </div>
  )
}

/** 喇叭：合成并朗读一段文字，再点一次停。卸载即停，换题不会留声 */
export function Speaker({ getText, label = '朗读' }) {
  const [st, setSt] = useState('idle') // idle | busy | playing
  const { toast } = useStore()
  // 卸载时既停当前音，也掐掉还在合成路上的请求——不然翻题后音频到货照播
  const ctlRef = useRef(null)
  useEffect(() => () => { ctlRef.current?.abort(); stopSpeak() }, [])

  async function click() {
    if (st === 'playing') { stopSpeak(); return setSt('idle') }
    if (st === 'busy') return
    const ctl = (ctlRef.current = new AbortController())
    setSt('busy')
    try {
      const a = await speak(getText(), ctl.signal)
      setSt('playing')
      a.onended = () => setSt('idle')
    } catch (e) {
      if (e.name !== 'AbortError') toast(e.message)
      setSt('idle')
    }
  }

  return (
    <button type="button" className="btn-sm btn-ghost spk" onClick={click}
      aria-label={st === 'playing' ? '停止朗读' : label} title={label}>
      {st === 'busy' ? <Icon name="loader" /> : st === 'playing' ? <Icon name="stop" /> : <Icon name="volume" />}
    </button>
  )
}

/** 正确答案 + 解析。答错时头部多一组 tab：教材解析 / AI 解析，点 AI 即开讲 */
export function Explain({ q, picked }) {
  const ok = picked === q.answer
  const [tab, setTab] = useState('book')
  const [aiOn, setAiOn] = useState(false) // AI 开过就保持挂载，切回教材不丢流式进度
  useEffect(() => { setTab('book'); setAiOn(false) }, [q.id])
  return (
    <div className={`explain ${ok ? 'right' : 'wrong'}`}>
      <div className="explain-head">
        正确答案 {'ABCD'[q.answer]}
        {picked === undefined
          ? <span className="verdict wrong">未作答</span>
          : <span className={`verdict ${ok ? 'right' : 'wrong'}`}>
              {ok ? '答对' : `你选了 ${'ABCD'[picked]}`}
            </span>}
        <span className="explain-tabs">
          <button className={tab === 'book' ? 'on' : ''} onClick={() => setTab('book')}>解析</button>
          <button className={tab === 'ai' ? 'on' : ''}
            onClick={() => { setAiOn(true); setTab('ai') }}><Icon name="sparkle" /> AI 解析</button>
        </span>
      </div>
      <div style={tab === 'book' ? null : { display: 'none' }}>
        <ExplainBody text={q.explain} />
        <Plain id={q.id} />
      </div>
      {aiOn && (
        <div style={tab === 'ai' ? null : { display: 'none' }}>
          <AiExplain q={q} picked={picked} key={q.id} />
        </div>
      )}
    </div>
  )
}

/**
 * AI 解析面板，挂载即开讲。流式出字，别让 reasoning 模型的思考时间变成白屏。
 * 没 Key 先就地要一个；401 由 ai.js 清 Key，这里退回输入态。
 * 生成结果按题缓存在内存里：换题再回来直接出上次的讲解，想要新的点「重新解析」。
 */
const AI_CACHE = new Map() // q.id -> 讲解全文，会话级

function AiExplain({ q, picked }) {
  const cached = AI_CACHE.get(q.id)
  const [state, setState] = useState(cached ? 'done' : 'loading') // key | loading | done | error
  const [text, setText] = useState(cached || '')
  const [err, setErr] = useState('')
  const inputRef = useRef(null)
  // 新请求顶掉旧请求，卸载时中止。不然 StrictMode 双挂载 / 快速重试会有两股流交错写 text
  const ctlRef = useRef(null)

  async function ask() {
    ctlRef.current?.abort()
    const ctl = (ctlRef.current = new AbortController())
    if (!getKey()) return setState('key')
    setState('loading')
    setText('')
    try {
      let acc = ''
      for await (const chunk of askAI(q, picked, ctl.signal)) {
        if (ctl.signal.aborted) return
        acc += chunk
        setText(acc)
      }
      if (ctl.signal.aborted) return
      AI_CACHE.set(q.id, acc)
      setState('done')
    } catch (e) {
      if (ctl.signal.aborted) return
      setErr(e.message)
      setState(getKey() ? 'error' : 'key')
    }
  }
  useEffect(() => {
    if (!AI_CACHE.has(q.id)) ask()
    return () => ctlRef.current?.abort()
  }, [])

  if (state === 'key') return (
    <div className="ai-key">
      <div className="row">
        <input ref={inputRef} type="password" placeholder="API Key"
          aria-label="API Key"
          onKeyDown={e => { if (e.key === 'Enter' && e.target.value.trim()) { setKey(e.target.value.trim()); ask() } }} />
        <button className="btn-sm btn-pri" onClick={() => {
          const v = inputRef.current.value.trim()
          if (v) { setKey(v); ask() }
        }}>开讲</button>
      </div>
      <span className="muted">
        {err || `Key 只存本机浏览器，与做题记录分开，只发给 ${getCfg().url.match(/\/\/([^/]+)/)?.[1] || '你配置的接口'}；可在「设置」页换模型`}
      </span>
    </div>
  )

  return (
    <div className="ai-box">
      {(text || state === 'loading') && (
        // 推理模型先想后说，内容没到之前给个交代，别只闪光标
        <div className="ai-text"><Md text={state === 'loading' ? `${text || '正在思考'}▍` : text} /></div>
      )}
      {state === 'done' && (
        <div className="row ai-actions">
          <Speaker getText={() => mdToSpeech(text)} label="朗读解析" />
          <button className="btn-sm btn-ghost" onClick={() => { AI_CACHE.delete(q.id); ask() }}>
            <Icon name="refresh" /> 重新解析
          </button>
        </div>
      )}
      {state === 'error' && (
        <div className="row"><span className="muted grow">{err}</span>
          <button className="btn-sm" onClick={ask}>重试</button></div>
      )}
    </div>
  )
}
