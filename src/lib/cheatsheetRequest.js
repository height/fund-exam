// Safari reports both failed fetches and interrupted response streams as “Load failed”.
export const isSheetNetworkError = error => error?.name !== 'AbortError' && /load failed|failed to fetch|fetch failed|networkerror|network request failed|network connection.*lost|请求失败（(?:408|429|500|502|503|504)）/i.test(error?.message || '')

function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve() }, ms)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
  })
}

export async function sheetRequest(run, { signal, onRetry, delay = 1000 } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError')
    try { return await run() }
    catch (error) {
      if (signal?.aborted || !isSheetNetworkError(error)) throw error
      if (attempt === 2) throw new Error('与 AI 服务的连接中断，自动重试后仍未恢复。请检查网络或模型接口后重试；上次小抄仍保留。', { cause: error })
      onRetry?.(attempt + 1)
      await pause(delay * (attempt + 1), signal)
    }
  }
}
