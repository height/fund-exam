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

/** 流式对话。401 时顺手清掉坏 Key，让 UI 重新要一个 */
async function* streamChat(userContent, signal) {
  const cfg = getCfg()
  const res = await fetch(cfg.url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      thinking: { type: 'enabled' },
      // 讲考点用不着深思熟虑，medium 起答快、够用
      reasoning_effort: 'medium',
      stream: true,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
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
    '1）正确答案是什么，一两句话说透背后的考点；' +
    '2）怎么记住它，给一个生活化的比喻；' +
    '3）如果有易混选项或相近的数字时限，用一张小表格对比强化记忆。' +
    '语言平实直接，不复述题目，不写总结，全文不超过250字。',
  ].join('\n'), signal)
}

/** 划词解释：选中一个词/短语，就地讲明白 */
export function askTerm(term, ctx, signal) {
  return streamChat(
    `我在备考基金从业资格考试，看到「${term}」这个说法不太懂` +
    (ctx ? `，它出现在这段话里：「${ctx}」` : '') +
    '。用大白话讲给零基础的人：先一句话说它是什么，再给一个好记的类比或对比；有常考数字或易混概念就顺带点一句。用 Markdown，不超过150字，直接讲，不要客套。', signal)
}

/* ---- 语音朗读（MiMo TTS）。Key 同样存 ai-config，与做题记录隔离 ---- */

let audioEl = null
export function stopSpeak() { audioEl?.pause(); audioEl = null }

/** 合成并播放。再次调用会顶掉上一段；返回 Audio 以便监听 ended */
export async function speak(text, signal) {
  const { ttsKey } = loadStore()
  if (!ttsKey) throw new Error('先在「设置」页填好语音 Key')
  const res = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'api-key': ttsKey },
    body: JSON.stringify({
      model: 'mimo-v2.5-tts',
      messages: [
        { role: 'user', content: '用清晰平稳、不快不慢的朗读语气，像老师念题一样，读下面这段话。' },
        { role: 'assistant', content: String(text).slice(0, 2000) },
      ],
      audio: { format: 'wav', voice: 'mimo_default' },
    }),
  })
  if (!res.ok) throw new Error(res.status === 401 ? '语音 Key 无效' : `语音接口返回 ${res.status}`)
  const b64 = (await res.json()).choices?.[0]?.message?.audio?.data
  if (!b64) throw new Error('语音接口没返回音频')
  // 合成期间用户已经翻题/关面板，别再出声
  if (signal?.aborted) throw new DOMException('已中止', 'AbortError')
  stopSpeak()
  audioEl = new Audio(`data:audio/wav;base64,${b64}`)
  await audioEl.play()
  return audioEl
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
