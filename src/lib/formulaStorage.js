import { kvGet, kvSet } from './db'
import { FORMULA_PROGRESS_KEY, emptyProgress, normalizeProgress } from './formulaProgress'

let writes = Promise.resolve()
export async function loadFormulaProgress() {
  await writes.catch(() => {})
  return normalizeProgress(await kvGet(FORMULA_PROGRESS_KEY, emptyProgress()))
}
export function saveFormulaProgress(value) {
  writes = writes.catch(() => {}).then(() => kvSet(FORMULA_PROGRESS_KEY, value))
  return writes
}
