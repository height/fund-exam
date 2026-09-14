const DAY_MS = 86400000

// 日期是本地日历日期，不将 YYYY-MM-DD 当作 UTC 时刻来显示。
export function examDateStamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const stamp = Date.parse(`${value}T00:00:00Z`)
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== value || value.startsWith('0000')) return null
  return stamp
}

export function examCountdownDays(value, now = new Date()) {
  const target = examDateStamp(value)
  if (target === null) return null
  // 将本地年月日映射到 UTC 日序号，避免夏令时让一天变成 23 或 25 小时。
  const today = new Date(0)
  today.setUTCFullYear(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today.getTime()) / DAY_MS)
}
