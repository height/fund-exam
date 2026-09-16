import { normalizeThinking, thinkingLevels } from './modelThinking.js'
export const THINKING_LEVELS = thinkingLevels('')
export function getThinkingLevel(scope = 'note', model = '') {
  try { return normalizeThinking(localStorage.getItem(`${scope}-thinking-level`), model) }
  catch { return normalizeThinking(null, model) }
}
export function setThinkingLevel(value, scope = 'note', model = '') {
  const normalized = normalizeThinking(value, model)
  try { localStorage.setItem(`${scope}-thinking-level`, normalized) } catch { /* session UI still works */ }
}
