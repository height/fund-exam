import { useState } from 'react'
import { getCfg } from './ai'
import { getThinkingLevel, setThinkingLevel } from './noteThinking'
import { normalizeThinking, thinkingLevels } from './modelThinking'

export function useThinkingLevel(scope = 'note') {
  const model = getCfg().model
  const [selection, setSelection] = useState(() => ({ model, value: getThinkingLevel(scope, model) }))
  const value = selection.model === model ? normalizeThinking(selection.value, model) : getThinkingLevel(scope, model)
  return [value, next => {
    const normalized = normalizeThinking(next, model)
    setSelection({ model, value: normalized })
    setThinkingLevel(normalized, scope, model)
  }, thinkingLevels(model)]
}
