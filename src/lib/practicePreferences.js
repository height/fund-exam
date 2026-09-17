const KEY = 'fund-exam:practice-selection'
export function readPracticePreferences() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || '{}')
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch { return {} }
}
export function savePracticePreferences(patch) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...readPracticePreferences(), ...patch })) } catch { /* Storage can be unavailable in private browsing. */ }
}
