export function noteReplyFailure(error, { stopped = false, timedOut = false } = {}) {
  const detail = error?.message || '未收到完整有效的笔记结果'
  if (timedOut) return { label: '等待超时', detail: '模型未在等待时间内完成，输入已保留，可重新发送。' }
  if (stopped || error?.name === 'AbortError') return { label: '已停止生成', detail: '本次生成已停止，输入已保留。' }
  if (/输出长度上限|被截断/.test(detail)) return { label: '模型输出被截断', detail }
  if (/网络|Failed to fetch|Load failed|NetworkError|network|流式数据传输/i.test(detail)) return { label: '连接中断', detail: '回复未完整接收。请检查网络后重试，输入已保留。' }
  if (/请求失败|服务返回错误|Key 无效/.test(detail)) return { label: '模型服务请求失败', detail }
  return { label: '笔记结果未通过校验', detail }
}

export const validNoteConversation = messages => messages.filter(message => !message.interrupted)
