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
export function stopSpeak() { audioEl?.pause(); audioEl = null }

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
}

/* 合成结果按念稿缓存：同一段话停了再播、翻回上一题再播，都不该重新花钱合成。
   存 objectURL 而不是 data: URI——重播时不用再把几 MB 的 base64 重新解析一遍。
   WAV 很占地方（一段 30 秒的稿子约 1.4MB），所以只留最近几段，超了就连
   objectURL 一起释放；会话级，刷新即清。 */
const VOICE_CACHE = new Map()
const VOICE_KEEP = 8

async function synth(text, signal) {
  const hit = VOICE_CACHE.get(text)
  if (hit) {                       // 命中就挪到队尾，淘汰的永远是最久没用的那段
    VOICE_CACHE.delete(text)
    VOICE_CACHE.set(text, hit)
    return hit
  }
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
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: 'audio/wav' }))
  VOICE_CACHE.set(text, url)
  while (VOICE_CACHE.size > VOICE_KEEP) {
    const oldest = VOICE_CACHE.keys().next().value
    URL.revokeObjectURL(VOICE_CACHE.get(oldest))
    VOICE_CACHE.delete(oldest)
  }
  return url
}

/** 合成并播放。再次调用会顶掉上一段；返回 Audio 以便监听 ended */
export async function speak(text, signal) {
  const url = await synth(text, signal)
  // 合成期间用户已经翻题/关面板，别再出声
  if (signal?.aborted) throw new DOMException('已中止', 'AbortError')
  stopSpeak()
  audioEl = new Audio(url)
  audioEl.preservesPitch = audioEl.webkitPreservesPitch = true
  audioEl.playbackRate = getTtsSpeed()
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
