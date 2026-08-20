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
            '你是基金从业资格考试的辅导老师。铁律：严禁编造任何不属实的信息。' +
            '数字、比例、金额、期限、时间点、法规条款，必须完全有把握才能说；' +
            '题目自带的解析是权威依据，事实以它为准，不得与之矛盾；' +
            '记不准的具体数字宁可不提，也绝不能猜——考生会把你的话当标准答案背下来，说错会让人在考场丢分，非常严重。' +
            '比喻和口诀可以发挥，但其中的事实必须准确。',
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
    '1）正确答案是什么，一两句话说透背后的考点；' +
    '2）怎么记住它，给一个生活化的比喻；' +
    '3）如果有易混选项或相近的数字时限，用一张小表格对比强化记忆。' +
    '如果这是计算题，换成讲：1）用人话解释公式里每个符号是什么；' +
    '2）分步代入，每一步写出中间数字，算到答案；' +
    '3）教一个不用精确计算也能锁定选项的招（比如先用简单利率估个大概、判断答案该比它大还是小，再排除）。' +
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
    '② 打个比方：用一个生活化比喻配 SVG 或图形示意，先建立直觉，别上术语；' +
    '③ 一步一步看：把推导或计算拆成 2~4 步做成「下一步」按钮交互，每步只讲一件事，' +
    '一行式子配一句大白话，当前步高亮、已走过的步保留；' +
    '④ 记住这一句：一行加粗口诀收尾。' +
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
