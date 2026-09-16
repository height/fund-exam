// Retry malformed model output once; never apply a partial document or retry cancellation.
export async function structuredReply({ prompt, signal, stream, parse, onProgress, retryHint = '', options = {} }) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    let text = ''
    onProgress?.('', attempt)
    try {
      const instruction = attempt ? '\n上次输出未通过完整性校验。请基于上述原始资料重新输出完整JSON，不续写，不省略字段，正确转义字符串，确保对象闭合。' + retryHint : ''
      for await (const chunk of stream(prompt + instruction, signal, { ...options, structured: true })) {
        if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
        text += chunk; onProgress?.(text, attempt)
      }
    } catch (error) {
      if (attempt || signal?.aborted || !/输出长度上限|流式数据传输不完整/.test(error.message)) throw error
      continue
    }
    try { return parse(text) }
    catch (error) {
      if (attempt || signal?.aborted) throw error
    }
  }
}
