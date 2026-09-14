import { jsonrepair } from 'jsonrepair'

function preserveBackslashes(text) {
  let quoted = false, output = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') quoted = !quoted
    if (quoted && c === '\\' && i + 1 < text.length) {
      const next = text[++i]
      const valid = '"\\/bfnrt'.includes(next) || (next === 'u' && /^[\da-f]{4}$/i.test(text.slice(i + 1, i + 5)))
      output += (valid ? '\\' : '\\\\') + next
    } else output += c
  }
  return output
}

// Only repair a closed object/array. Never let the repair library invent the
// missing tail of an interrupted response, even though it supports doing so.
export function parseAIJSON(text) {
  const raw = text.trim().replace(/^\uFEFF/, '')
  try { return JSON.parse(raw) } catch { /* optional prose/fences or syntax errors */ }
  const start = raw.search(/[\[{]/)
  if (start < 0) throw new Error('AI 没有返回可解析的数据')
  const stack = []
  let quoted = false, escaped = false
  for (let i = start; i < raw.length; i++) {
    const c = raw[i]
    if (quoted) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') quoted = false
      continue
    }
    if (c === '"') { quoted = true; continue }
    if (raw.slice(i, i + 3) === '...') throw new Error('AI 省略了部分数据，请重新生成完整内容')
    if (c === '{' || c === '[') stack.push(c)
    if (c === '}' || c === ']') {
      if (/:\s*$/.test(raw.slice(start, i))) throw new Error('AI 返回的字段内容缺失，请重试')
      if (stack.pop() !== (c === '}' ? '{' : '[')) throw new Error('AI 返回的数据结构不完整，请重试')
      if (!stack.length) {
        const candidate = raw.slice(start, i + 1)
        try { return JSON.parse(candidate) } catch { /* repair syntax only */ }
        // Inline SVG/HTML often contains unescaped attribute quotes. Restrict
        // this fix to markup tags and preserve quotes that are already escaped.
        const markupEscaped = candidate.replace(/<[a-zA-Z][^<>]*>/g, tag => tag.replace(/"/g, (quote, index) => {
          let slashes = 0
          for (let j = index - 1; j >= 0 && tag[j] === '\\'; j--) slashes++
          return slashes % 2 ? quote : '\\"'
        }))
        try { return JSON.parse(jsonrepair(preserveBackslashes(markupEscaped))) }
        catch { throw new Error('AI 返回的格式无法安全修复，请重试；已有笔记未改动') }
      }
    }
  }
  throw new Error('AI 回复在结束前被截断，请缩小修改范围后重试')
}

const contentText = content => typeof content === 'string' ? content : Array.isArray(content)
  ? content.filter(p => p.type === 'text').map(p => p.text || '').join('') : ''

function* completionPayload(value) {
  if (value.error) throw new Error(`AI 服务返回错误：${value.error.message || '请求未完成'}`)
  const choice = value.choices?.[0]
  const text = contentText(choice?.delta?.content ?? choice?.message?.content)
  if (text) yield text
  if (choice?.finish_reason === 'length') throw new Error('AI 回复达到输出长度上限，内容未完成；请分步修改或减少一次整理的内容')
  if (choice?.finish_reason === 'content_filter') throw new Error('AI 服务中断了本次回复，请调整描述后重试')
}

// SSE events, not transport chunks, are the parsing boundary. Comments and
// metadata are ignored; flush the final event even when there is no newline.
export async function* readChatResponse(response) {
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    yield* completionPayload(await response.json())
    return
  }
  if (!response.body) throw new Error('AI 服务返回了空响应')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = '', data = []
  function* event() {
    if (!data.length) return
    const payload = data.join('\n').trim(); data = []
    if (payload === '[DONE]') return true
    if (!payload) return
    let value
    try { value = JSON.parse(payload) }
    catch { throw new Error('AI 流式数据传输不完整，请重试') }
    yield* completionPayload(value)
    return false
  }
  function* line(value) {
    if (!value) return yield* event()
    if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''))
    return false
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      // Keep a trailing CR until the next chunk in case it is half of CRLF.
      let match
      while ((match = /\r\n|\n|\r(?!$)/.exec(buffer))) {
        const value = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        if (yield* line(value)) return
      }
      if (done) {
        if (buffer && (yield* line(buffer.replace(/\r$/, '')))) return
        yield* event()
        return
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
