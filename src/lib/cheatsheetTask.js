// Owned by App, so subscribing/unsubscribing a page never cancels its request.
export function createCheatsheetTask({ load, generate, save, timeout = 1200000 }) {
  let state = { results: {}, subject: '', draft: null, cacheLoading: true, status: 'idle', progress: null, error: '', effort: '' }
  let loading, controller, request
  const listeners = new Set()
  const update = patch => { state = { ...state, ...patch }; listeners.forEach(listener => listener()) }
  const busy = () => state.status === 'generating' || state.status === 'saving'
  const task = {
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    load: () => loading ||= Promise.resolve().then(load)
      .then(results => update({ results }))
      .catch(() => update({ error: '上次小抄读取失败，可重新生成' }))
      .finally(() => update({ cacheLoading: false })),
    async start(input, retry = false) {
      if (busy() || state.cacheLoading || (state.draft && !retry)) return
      const snapshot = structuredClone(input)
      if (!snapshot.subject || !snapshot.notes.length || snapshot.notes.some(n => n.subject !== snapshot.subject)) return
      request = snapshot
      const ctl = new AbortController()
      controller = ctl
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; ctl.abort() }, timeout)
      update({ subject: snapshot.subject, status: 'generating', draft: null, progress: null, error: '', effort: snapshot.effort })
      try {
        const draft = await generate(snapshot, ctl.signal, progress => {
          if (!ctl.signal.aborted) update({ progress })
        })
        if (ctl.signal.aborted) throw new DOMException('已取消', 'AbortError')
        update({ draft, status: 'ready' })
      } catch (error) {
        update({ status: 'error', error: ctl.signal.aborted
          ? (timedOut ? '生成超时，上次小抄仍保留，请重试。' : '生成已取消，上次小抄仍保留。')
          : `生成失败：${error.message}` })
      } finally {
        clearTimeout(timer)
        controller = null
      }
    },
    cancel: () => controller?.abort(),
    retry: () => request && task.start(request, true),
    async keep() {
      if (busy() || !state.draft) return false
      const draft = state.draft
      update({ status: 'saving', error: '' })
      try {
        await save(draft)
        update({ results: { ...state.results, [state.subject]: draft }, draft: null, status: 'idle' })
        return true
      } catch {
        update({ status: 'ready', error: '本地保存失败，请重试保留，或打开小抄下载。' })
        return false
      }
    },
    discard() {
      if (!busy()) update({ draft: null, status: 'idle', error: '', progress: null })
    },
  }
  return task
}
