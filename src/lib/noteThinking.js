export const THINKING_LEVELS = ['off', 'low', 'medium', 'high', 'max']
// A new key makes MEDIUM the default instead of inheriting the old MAX-only switch.
export function getThinkingLevel(scope = 'note') {
  try {
    const value = localStorage.getItem(`${scope}-thinking-level`)
    return THINKING_LEVELS.includes(value) ? value : 'medium'
  } catch { return 'medium' }
}
export function setThinkingLevel(value, scope = 'note') {
  if (!THINKING_LEVELS.includes(value)) return
  try { localStorage.setItem(`${scope}-thinking-level`, value) } catch { /* session UI still works */ }
}
