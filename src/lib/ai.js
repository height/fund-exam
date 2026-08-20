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

/** 流式返回讲解文本片段。401 时顺手清掉坏 Key，让 UI 重新要一个 */
export async function* askAI(q, picked) {
  const cfg = getCfg()
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      thinking: { type: 'enabled' },
      // 讲一道选择题用不着深思熟虑，medium 起答快、够用
      reasoning_effort: 'medium',
      stream: true,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        {
          role: 'user',
          content: [
            q.q,
            ...q.options.map((o, i) => `${'ABCD'[i]}\n${o}`),
            `正确答案 ${'ABCD'[q.answer]}`,
            picked === undefined ? '你没有作答' : `你选了 ${'ABCD'[picked]}`,
            q.explain,
            '',
            '这道题为啥没做对，我该如何记住这道题的正确答案，我是一个基金小白，请教教我，要言简意赅，模仿阮一峰的风格(但不要外化阮一峰等无关帮助理解的相关信息)',
          ].join('\n'),
        },
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
