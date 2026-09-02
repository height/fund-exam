import { PCMPlayer } from '@speechmatics/web-pcm-player'
import { SoundTouchNode } from '@soundtouchjs/audio-worklet'
import soundTouchProcessorUrl from '@soundtouchjs/audio-worklet/processor?url'
import { claimIOSPlayback } from './iosAudio'

/**
 * AI 解析，走 OpenAI 兼容的 chat/completions 接口，浏览器 fetch 直连，不引 SDK。
 * 配置（接口地址、模型名、Key）存 localStorage——与做题记录（IndexedDB）隔离，
 * 清空练习进度不会带走它；Key 只随请求发给用户自己配置的接口，不落任何后端。
 */
const CFG = 'ai-config'

export const PRESETS = {
  deepseek: { label: 'DeepSeek', url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-v4-pro' },
  // Coding 套餐走专用端点；普通按量 API Key 把地址改回 /api/paas/v4/chat/completions 即可
  glm: { label: '智谱 GLM', url: 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions', model: 'glm-5.3' },
  // ZenMux 是聚合网关，OpenAI 兼容，模型名带厂商前缀。换别家模型只改「模型名称」那一栏即可
  zenmux: { label: 'ZenMux', url: 'https://zenmux.ai/api/v1/chat/completions', model: 'deepseek/deepseek-v4-pro' },
}

/**
 * 存储结构：{ active: 'deepseek'|'glm', providers: { deepseek: {url,model,key}, glm: {...} } }
 * 两家各存一份配置，active 是当前默认，设置页 tab 一点就切。
 */
export function loadStore() {
  try {
    const c = JSON.parse(localStorage.getItem(CFG))
    if (c?.providers) return c
    // 旧版是单份平铺配置，装进对应 provider
    if (c?.url) {
      const k = c.preset || 'deepseek'
      return { active: k, providers: { [k]: { url: c.url, model: c.model, key: c.key || '' } } }
    }
  } catch { /* 坏数据当没配过 */ }
  const oldKey = localStorage.getItem('deepseek-key') // 首版只存过 key
  return { active: 'deepseek', providers: oldKey ? { deepseek: { ...provDefault('deepseek'), key: oldKey } } : {} }
}
export const saveStore = s => localStorage.setItem(CFG, JSON.stringify(s))

export const provDefault = k => ({ url: PRESETS[k].url, model: PRESETS[k].model, key: '' })

/** 当前默认模型的完整配置（已保存值盖过预设默认） */
export function getCfg(store = loadStore()) {
  const k = PRESETS[store.active] ? store.active : 'deepseek'
  return { ...provDefault(k), ...store.providers[k] }
}
export const getKey = () => getCfg().key
export const setKey = key => {
  const s = loadStore()
  s.providers = { ...s.providers, [s.active]: { ...getCfg(s), key } }
  saveStore(s)
}

/** 保存前的连通性测试：发一条最小请求，通了才算配置有效 */
export async function pingAI(cfg) {
  let res
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model, stream: false, max_tokens: 16,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })
  } catch {
    throw new Error('网络不通或接口地址不对')
  }
  if (res.status === 401) throw new Error('Key 无效')
  if (!res.ok) {
    // 接口自己的报错（如「余额不足」）比裸状态码有用得多
    const msg = (await res.json().catch(() => null))?.error?.message
    throw new Error(msg || `接口返回 ${res.status}`)
  }
}

/** 流式对话。401 时顺手清掉坏 Key，让 UI 重新要一个。think=false 关掉推理，秒出正文 */
async function* streamChat(userContent, signal, { think = true } = {}) {
  const cfg = getCfg()
  const res = await fetch(cfg.url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      thinking: { type: think ? 'enabled' : 'disabled' },
      // 讲考点用不着深思熟虑，medium 起答快、够用
      ...(think && { reasoning_effort: 'medium' }),
      stream: true,
      messages: [
        {
          role: 'system',
          content:
            '你是资深的基金从业资格考试辅导老师，也极擅长把复杂金融概念讲给零基础的人听。两条铁律：' +
            '一、严禁编造任何不属实的信息。数字、比例、金额、期限、时间点、法规条款，必须完全有把握才能说；' +
            '题目自带的解析是权威依据，事实以它为准，不得与之矛盾；' +
            '记不准的具体数字宁可不提，也绝不能猜——考生会把你的话当标准答案背下来，说错会让人在考场丢分，非常严重。' +
            '二、比喻是降低理解成本的手段，不是任务：考点能自然映射到生活常理才打比方，' +
            '映射得牵强就宁可不打，直接把业务逻辑本身讲顺（谁、对谁、做什么、为什么），' +
            '或改用更贴近金融场景的例子——一切以讲清基金从业里的逻辑为准。' +
            '凡是用了比喻，讲完必须无缝落回考试的标准术语和官方表述——' +
            '学员最终要用官方口径去认题、答题，不能只记住比喻。' +
            '三、表达基线按小学水平来：短句，一句话只说一件事；' +
            '百分数尽量换算成具体钱数（10亿的0.9%就是900万）；' +
            '分数除法要说人话（90/365 就是「90天占一年的几分之几」）；' +
            '专业术语可以出现，但第一次出现必须紧跟一句小学生也能懂的解释。',
        },
        { role: 'user', content: userContent },
      ],
    }),
  })
  if (res.status === 401) { setKey(''); throw new Error('Key 无效，已清除，请重新填一个') }
  if (!res.ok) throw new Error(`请求失败（${res.status}），稍后再试`)

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()
    for (const l of lines) {
      const s = l.replace(/^data: ?/, '').trim()
      if (!s || s === '[DONE]') continue
      const delta = JSON.parse(s).choices?.[0]?.delta
      if (delta?.content) yield delta.content // reasoning_content 是思考过程，不上屏
    }
  }
}

/** 答错题的整题讲解 */
export function askAI(q, picked, signal) {
  return streamChat([
    q.q,
    ...q.options.map((o, i) => `${'ABCD'[i]}\n${o}`),
    `正确答案 ${'ABCD'[q.answer]}`,
    picked === undefined ? '你没有作答'
      : picked === q.answer ? '我答对了' : `你选了 ${'ABCD'[picked]}`,
    q.explain,
    '',
    '我是基金小白，不用分析我选得对不对。直接讲三件事：' +
    '1）正确答案是什么，一两句话说透考点，顺带一句这条规定背后的道理（为什么要这么定）；' +
    '2）怎么记住它：有贴切的生活比喻就用（角色要对应回标准术语）；' +
    '比喻不贴切就别硬造，直接把这条业务逻辑讲顺，或举一个金融场景里的真实例子；' +
    '3）如果有易混选项、相近的数字时限，或「不得/应当/可以/禁止」这类法条信号词，用一张小表格对比强化记忆。' +
    '如果这是计算题，换成讲：1）用人话解释公式里每个符号是什么；' +
    '2）分步代入，每一步单独一行、写出中间数字，一路算到最终答案，别把长式子挤在一行里；' +
    '3）教一个不用精确计算的快捷判断（估个大概、判断方向、排除离谱项）——但要诚实：' +
    '估算能排除到哪一步就说到哪一步，相邻选项挨得太近分不出时，明说这题必须精确算，不许假装锁定。' +
    '另外：不知道干扰项的数字是怎么凑出来的，就不要给它编一个来源，宁可不解释。' +
    '语言平实直接，不复述题目，不写总结，不用 emoji（是/否直接写字），正文不超过300字（表格不计入）。',
  ].join('\n'), signal)
}

/** 划词解释：选中一个词/短语，就地讲明白 */
export function askTerm(term, ctx, signal) {
  return streamChat(
    `我在备考基金从业资格考试，看到「${term}」这个说法不太懂` +
    (ctx ? `，它出现在这段话里：「${ctx}」` : '') +
    '。讲给零基础的人：先用考试口径一句话说它是什么，紧跟一句大白话翻译；' +
    '再给一个帮助记忆的类比或对比——贴切才用，硬凑不如直接把这个概念的逻辑讲清；' +
    '有常考数字、易混概念或法条信号词就顺带点一句。' +
    '用 Markdown，不超过150字，直接讲，不要客套。', signal)
}

/**
 * 图解演示：让模型产出自包含 HTML（可内嵌 SVG/动画），由沙箱 iframe 渲染。
 * onProgress 每收到一段就回调累计长度，生成要一阵子，得给用户看到活着的进度。
 */
export async function askDemo(q, signal, onProgress) {
  let html = ''
  const prompt = [
    q.q,
    ...q.options.map((o, i) => `${'ABCD'[i]}. ${o}`),
    `正确答案 ${'ABCD'[q.answer]}`,
    q.explain,
    '',
    '请生成一个自包含的 HTML 演示页，教一个完全没有金融基础的人看懂这道题。' +
    '信息结构从上到下固定四块，每块有编号小标题，读者按顺序读完刚好懂：' +
    '① 一句话结论：正确答案 + 这道题考什么，放最上面、字最大；' +
    '② 建立直觉：有贴切的生活比喻就用比喻配图形；映射不自然就别硬套，' +
    '直接把业务关系或流程画成示意图（谁把什么交给谁、谁监督谁、钱怎么流），用图形本身降低理解成本；' +
    '凡用了比喻，讲完立刻把角色一一对应回考试的标准术语（用小字标注也行），别让读者只记住故事；' +
    '③ 一步一步看：拆成 2~4 步做成「下一步」按钮交互，每步只讲一件事，当前步高亮、已走过的步保留；' +
    '步骤内容按题型定：计算题=分步代入算到答案（一行式子配一句大白话）；' +
    '法规流程题=按业务流程或时间线走一遍；识记题（年份、名录）=看清考什么→拆穿干扰项→锁定答案；' +
    '组合判断题=逐项判对错再合并；' +
    '④ 记住这一句：一行加粗口诀收尾，若考点带「不得/应当/禁止」这类法条信号词，把它们标出来。' +
    '排版要求：只输出完整 HTML 文档，内联全部 CSS/JS，禁止外部资源；' +
    '页面只会在竖屏手机上看：加 <meta name="viewport" content="width=device-width, initial-scale=1">，' +
    '全部流式布局，容器和图形宽度用百分比，禁止固定像素宽度、禁止横向滚动；' +
    '白底深字，正文不小于 15px、行距 1.7，每块之间留足空白；' +
    '术语第一次出现必须紧跟一句大白话解释；不要使用 emoji；' +
    '所有数字和结论必须与题目、解析完全一致，严禁编造。除 HTML 本身外不要输出任何说明文字。',
  ].join('\n')
  // 画页面是体力活不是脑力活：关掉思考模式，正文立刻开始流，进度才有的看
  for await (const c of streamChat(prompt, signal, { think: false })) {
    html += c
    onProgress?.(html.length)
  }
  // 模型习惯裹 ``` 围栏，剥掉；没裹就原样用
  const m = html.match(/```(?:html)?\n?([\s\S]*?)```/)
  return (m ? m[1] : html).trim()
}

/* ---- 语音朗读（MiMo TTS）。Key 同样存 ai-config，与做题记录隔离 ---- */

let audioEl = null
let streamSession = null
export function stopSpeak() {
  if (audioEl) {
    const ended = audioEl.onended
    audioEl.onended = audioEl.onerror = null
    audioEl.pause()
    audioEl = null
    ended?.()
  }
  if (streamSession) {
    const s = streamSession
    streamSession = null
    s.stop()
  }
}

/* 朗读语速。走播放器的 playbackRate 而不是求接口支持 speed 参数：
   任何音源都生效、改了立刻作用于正在播的这一段，也不用重新合成。
   preservesPitch 保证提速不变调（默认就是 true，Safari 老版本要显式给）。 */
export const TTS_SPEEDS = [0.75, 1, 1.25, 1.5, 2]
export const getTtsSpeed = () => {
  const v = Number(loadStore().ttsSpeed)
  return TTS_SPEEDS.includes(v) ? v : 1
}
export function setTtsSpeed(v) {
  saveStore({ ...loadStore(), ttsSpeed: v })
  if (audioEl) audioEl.playbackRate = v      // 正在播的立刻跟上，不用等下一句
  streamSession?.setRate(v)
}

/* 合成结果按念稿缓存：同一段话停了再播、翻回上一题再播，都不该重新花钱合成。
   存 objectURL 而不是 data: URI——重播时不用再把几 MB 的 base64 重新解析一遍。
   WAV 很占地方（一段 30 秒的稿子约 1.4MB），所以只留最近几段，超了就连
   objectURL 一起释放；会话级，刷新即清。 */
const VOICE_CACHE = new Map()
const VOICE_KEEP = 8

function cacheVoice(text, url) {
  VOICE_CACHE.set(text, url)
  while (VOICE_CACHE.size > VOICE_KEEP) {
    const oldest = VOICE_CACHE.keys().next().value
    URL.revokeObjectURL(VOICE_CACHE.get(oldest))
    VOICE_CACHE.delete(oldest)
  }
}

function cachedVoice(text) {
  const hit = VOICE_CACHE.get(text)
  if (hit) {                       // 命中就挪到队尾，淘汰的永远是最久没用的那段
    VOICE_CACHE.delete(text)
    VOICE_CACHE.set(text, hit)
    return hit
  }
  return null
}

/* 统一 Audio 与流式播放器的结束/报错接口。监听器偶尔会在事件发生后才挂上
   （第一包和 [DONE] 紧挨着时很常见），所以事件要暂存，不能悄悄丢掉。 */
function speechHandle(onStop) {
  let endFn = null, errFn = null, ended = false, error = null
  return {
    stop: onStop,
    get onended() { return endFn },
    set onended(fn) { endFn = fn; if (ended && fn) queueMicrotask(fn) },
    get onerror() { return errFn },
    set onerror(fn) { errFn = fn; if (error && fn) queueMicrotask(() => fn(error)) },
    _end() { if (!ended && !error) { ended = true; endFn?.() } },
    _error(e) { if (!ended && !error) { error = e; errFn?.(e) } },
  }
}

async function playCached(url, signal) {
  if (signal?.aborted) throw new DOMException('已中止', 'AbortError')
  const releaseIOSPlayback = claimIOSPlayback()
  const a = (audioEl = new Audio(url))
  const h = speechHandle(() => {
    if (audioEl === a) audioEl = null
    a.pause()
    releaseIOSPlayback()
  })
  a.preservesPitch = a.webkitPreservesPitch = true
  a.playbackRate = getTtsSpeed()
  a.onended = () => { if (audioEl === a) audioEl = null; releaseIOSPlayback(); h._end() }
  a.onerror = () => {
    if (audioEl === a) audioEl = null
    releaseIOSPlayback()
    h._error(new Error('语音播放失败'))
  }
  try { await a.play() }
  catch (e) {
    if (audioEl === a) audioEl = null
    releaseIOSPlayback()
    throw e
  }
  return h
}

const TTS_SAMPLE_RATE = 24000
const START_BUFFER_SAMPLES = TTS_SAMPLE_RATE * 0.4 // 攒 400ms 再响，抵抗第一轮网络抖动
const SCHEDULE_AHEAD = 0.65                       // AudioContext 最多预排 650ms，方便即时变速
const FIRST_AUDIO_TIMEOUT = 15000
const STALL_TIMEOUT = 12000
const PROCESSOR_TAIL = 0.45                      // SoundTouch 把尾音吐干净需要一点时间

function pcmToWav(chunks) {
  const samples = chunks.reduce((n, c) => n + c.length, 0)
  const buf = new ArrayBuffer(44 + samples * 2)
  const v = new DataView(buf)
  const ascii = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)))
  ascii(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); ascii(8, 'WAVE')
  ascii(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true)
  v.setUint16(22, 1, true); v.setUint32(24, TTS_SAMPLE_RATE, true)
  v.setUint32(28, TTS_SAMPLE_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true)
  ascii(36, 'data'); v.setUint32(40, samples * 2, true)
  let p = 44
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++, p += 2) v.setInt16(p, chunk[i], true)
  }
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

function decodePcm16(b64, carry) {
  const raw = atob(b64)
  let bytes = new Uint8Array(raw.length + (carry === null ? 0 : 1))
  let at = 0
  if (carry !== null) bytes[at++] = carry
  for (let i = 0; i < raw.length; i++) bytes[at++] = raw.charCodeAt(i)
  const nextCarry = bytes.length % 2 ? bytes[bytes.length - 1] : null
  if (nextCarry !== null) bytes = bytes.subarray(0, bytes.length - 1)
  // PCM16LE；DataView 明确写小端，避免把平台字节序当成协议的一部分。
  const pcm = new Int16Array(bytes.length / 2)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(i * 2, true)
  return [pcm, nextCarry]
}

function resamplePcm(pcm, fromRate, toRate) {
  if (fromRate === toRate) return pcm
  const out = new Int16Array(Math.max(1, Math.round(pcm.length * toRate / fromRate)))
  const scale = fromRate / toRate
  for (let i = 0; i < out.length; i++) {
    const x = i * scale, a = Math.floor(x), b = Math.min(a + 1, pcm.length - 1)
    out[i] = Math.round(pcm[a] + (pcm[b] - pcm[a]) * (x - a))
  }
  return out
}

/**
 * MiMo 的 SSE 每个 delta 带一段 base64 PCM16。PCMPlayer 负责无缝排队，
 * SoundTouch AudioWorklet 负责变速时保住音调；本层只管网络、缓冲和生命周期。
 */
function makeStreamSession(text, outerSignal, onState) {
  const ctl = new AbortController()
  const handle = speechHandle(() => stop())
  let session = null
  let ctx = null, player = null, touch = null, tickId = null, firstTimer = null
  let releaseIOSPlayback = () => {}
  let rate = getTtsSpeed(), scheduledUntil = 0, pendingSamples = 0
  let pending = [], collected = [], sources = new Set(), carry = null
  let gotAudio = false, playing = false, streamDone = false, stopped = false, lastAudioAt = 0
  let state = 'busy', startResolve, startReject, startSettled = false
  const started = new Promise((resolve, reject) => { startResolve = resolve; startReject = reject })

  const setState = next => {
    if (state !== next) { state = next; onState?.(next) }
  }
  const abortError = () => new DOMException('已中止', 'AbortError')
  const detachOuter = () => outerSignal?.removeEventListener('abort', outerAbort)

  function cleanup() {
    if (stopped) return
    stopped = true
    clearTimeout(firstTimer); clearInterval(tickId)
    ctl.abort()
    player?.interrupt()
    for (const source of sources) { try { source.stop() } catch { /* 已自然结束 */ } }
    sources.clear()
    try { touch?.disconnect() } catch { /* 未连上 */ }
    ctx?.close().catch(() => {})
    releaseIOSPlayback()
    detachOuter()
    if (streamSession === session) streamSession = null
  }

  function stop(notify = true) {
    if (stopped) return
    cleanup()
    if (!startSettled) { startSettled = true; startReject(abortError()) }
    else if (notify) handle._end()
  }

  function fail(e) {
    if (stopped) return
    const afterStart = startSettled
    cleanup()
    if (afterStart) handle._error(e)
    else { startSettled = true; startReject(e) }
  }

  function end() {
    if (stopped) return
    cleanup()
    handle._end()
  }

  function outerAbort() { stop(false) }
  if (outerSignal?.aborted) stop()
  else outerSignal?.addEventListener('abort', outerAbort, { once: true })

  function createPlayerContext() {
    // PCMPlayer 把 gain 连到 context.destination。这里把 destination 换成
    // SoundTouch，并截住 BufferSource，才能在流式播放中动态改语速且不变调。
    return new Proxy(ctx, {
      get(target, prop) {
        if (prop === 'destination') return touch
        if (prop === 'createBufferSource') return () => {
          const source = target.createBufferSource()
          source.playbackRate.value = rate
          sources.add(source)
          return source
        }
        const value = Reflect.get(target, prop, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  }

  function feed(pcm) {
    const now = ctx.currentTime
    const startAt = Math.max(scheduledUntil, now)
    const audio = resamplePcm(pcm, TTS_SAMPLE_RATE, ctx.sampleRate)
    player.playbackTime = startAt
    player.playAudio(audio)
    scheduledUntil = startAt + pcm.length / TTS_SAMPLE_RATE / rate
    // PCMPlayer 不知道我们给 source 加了 playbackRate，需要校正下一段的排期。
    player.playbackTime = scheduledUntil
  }

  function beginPlayback() {
    if (playing || stopped) return
    playing = true
    setState('playing')
    if (!startSettled) { startSettled = true; startResolve(handle) }
  }

  function tick() {
    if (stopped || !ctx) return
    const now = ctx.currentTime

    if (!playing && (pendingSamples >= START_BUFFER_SAMPLES || (streamDone && pendingSamples))) {
      beginPlayback()
    }
    if (playing) {
      while (pending.length && scheduledUntil - now < SCHEDULE_AHEAD) {
        const pcm = pending.shift()
        pendingSamples -= pcm.length
        feed(pcm)
      }
      const ahead = scheduledUntil - now
      if (!streamDone && !pending.length && ahead < 0.08) setState('buffering')
      else setState('playing')
      if (streamDone && !pending.length && now >= scheduledUntil + PROCESSOR_TAIL) end()
      if (!streamDone && !pending.length && ahead < 0.08 &&
          gotAudio && Date.now() - lastAudioAt > STALL_TIMEOUT) {
        fail(new Error('语音流中断，请重试'))
      }
    } else if (gotAudio && Date.now() - lastAudioAt > STALL_TIMEOUT) {
      fail(new Error('语音生成停住了，请重试'))
    }
  }

  function addAudio(data) {
    const [pcm, nextCarry] = decodePcm16(data, carry)
    carry = nextCarry
    if (!pcm.length) return
    if (!gotAudio) { gotAudio = true; clearTimeout(firstTimer) }
    lastAudioAt = Date.now()
    pending.push(pcm); pendingSamples += pcm.length; collected.push(pcm)
    tick()
  }

  function finishStream() {
    if (stopped) return
    streamDone = true
    if (!gotAudio) return fail(new Error('语音接口没返回音频'))
    cacheVoice(text, pcmToWav(collected))
    tick()
  }

  async function pump() {
  const { ttsKey } = loadStore()
  if (!ttsKey) throw new Error('先在「设置」页填好语音 Key')
  const res = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
    method: 'POST',
    signal: ctl.signal,
    headers: { 'Content-Type': 'application/json', 'api-key': ttsKey },
    body: JSON.stringify({
      model: 'mimo-v2.5-tts',
      messages: [
        { role: 'user', content: '用清晰平稳、不快不慢的朗读语气，像老师念题一样，读下面这段话。' },
        { role: 'assistant', content: String(text).slice(0, 2000) },
      ],
      audio: { format: 'pcm16', voice: 'mimo_default' },
      stream: true,
    }),
  })
  if (!res.ok) throw new Error(res.status === 401 ? '语音 Key 无效' : `语音接口返回 ${res.status}`)
    if (!res.body) throw new Error('浏览器不支持流式语音响应')

    const reader = res.body.getReader(), dec = new TextDecoder()
    let buf = '', done = false
    const line = raw => {
      const s = raw.replace(/^data: ?/, '').trim()
      if (!s || s.startsWith(':')) return
      if (s === '[DONE]') { done = true; return }
      const audio = JSON.parse(s).choices?.[0]?.delta?.audio
      if (audio?.data) addAudio(audio.data)
    }
    while (!done) {
      const part = await reader.read()
      if (part.done) break
      buf += dec.decode(part.value, { stream: true })
      const lines = buf.split(/\r?\n/)
      buf = lines.pop()
      for (const l of lines) { line(l); if (done) break }
    }
    buf += dec.decode()
    if (!done && buf.trim()) line(buf)
    if (done) reader.cancel().catch(() => {})
    finishStream()
  }

  async function start() {
    if (stopped) return started
    try {
      try { ctx = new AudioContext({ sampleRate: TTS_SAMPLE_RATE, latencyHint: 'interactive' }) }
      catch { ctx = new AudioContext({ latencyHint: 'interactive' }) }
      // 要在第一次 await 前认领 playback 会话，否则 iOS 会丢掉这次点击的播放授权。
      releaseIOSPlayback = claimIOSPlayback({ webAudio: true, sampleRate: ctx.sampleRate })
      await ctx.resume()
      await SoundTouchNode.register(ctx, soundTouchProcessorUrl)
      if (stopped) return started
      touch = new SoundTouchNode({ context: ctx, outputChannelCount: 1 })
      touch.playbackRate.value = rate
      touch.connect(ctx.destination)
      player = new PCMPlayer(createPlayerContext())
      scheduledUntil = ctx.currentTime
      tickId = setInterval(tick, 50)
      firstTimer = setTimeout(() => fail(new Error('语音生成超时，请重试')), FIRST_AUDIO_TIMEOUT)
      pump().catch(e => { if (!stopped) fail(e.name === 'AbortError' ? abortError() : e) })
    } catch (e) {
      fail(e)
    }
    return started
  }

  function setRate(v) {
    if (!TTS_SPEEDS.includes(v)) return
    const old = rate
    rate = v
    if (!ctx || !touch) return
    const now = ctx.currentTime
    // 只预排很短一截，所以修正剩余排期即可；后续分片全部按新速度进入。
    scheduledUntil = now + Math.max(0, scheduledUntil - now) * old / rate
    player.playbackTime = scheduledUntil
    touch.playbackRate.setValueAtTime(rate, now)
    for (const source of sources) {
      try { source.playbackRate.setValueAtTime(rate, now) } catch { /* 已结束 */ }
    }
  }

  session = { start, stop, setRate }
  return session
}

/** 合成并播放。再次调用会顶掉上一段；第一段开始播放后即返回控制句柄 */
export async function speak(text, signal, onState) {
  stopSpeak()
  const hit = cachedVoice(text)
  if (hit) return playCached(hit, signal)
  const session = makeStreamSession(text, signal, onState)
  streamSession = session
  try { return await session.start() }
  catch (e) {
    if (streamSession === session) streamSession = null
    throw e
  }
}

// TTS 不认罗马数字，Ⅰ Ⅱ Ⅲ Ⅳ 全被念成「一」，组合题先翻成「第几项」
const ROMAN = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫ'
const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二']
const speakable = s => String(s)
  .replace(/[Ⅰ-Ⅻ]/g, c => `第${CN[ROMAN.indexOf(c)]}项`)
  .replace(/。+/g, '。')

/** 题目念稿：只读题干 + 选项，永远不念答案 */
export const qToSpeech = q => speakable([
  q.q.replace(/（\s*）|\(\s*\)/g, '什么'),
  ...q.options.map((o, i) => `选项${'ABCD'[i]}，${o}`),
].join('。'))

/** Markdown 念稿：把排版符号扒掉 */
export const mdToSpeech = t => speakable(String(t)
  .replace(/\*\*|`|^#+\s*/gm, '')
  .replace(/^[-*_]{3,}\s*$/gm, '')
  .replace(/\|/g, '，'))
