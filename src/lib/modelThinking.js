export const isGLM53 = model => /(?:^|\/)glm-5\.3(?:\[1m\])?$/i.test(model)
export const thinkingLevels = model => isGLM53(model) ? ['low', 'high', 'max'] : ['off', 'low', 'medium', 'high', 'max']
export function normalizeThinking(value, model) {
  const levels = thinkingLevels(model)
  if (isGLM53(model) && value === 'off') return 'low'
  return levels.includes(value) ? value : levels[Math.floor(levels.length / 2)]
}
// GLM-5.3 uses reasoning-only inference; MEDIUM maps to its middle supported tier.
export function modelThinking(model, think = true, effort = 'medium') {
  if (isGLM53(model)) {
    return { thinking: { type: 'enabled' }, reasoning_effort: !think ? 'low' : normalizeThinking(effort, model) }
  }
  return { thinking: { type: think ? 'enabled' : 'disabled' }, ...(think && { reasoning_effort: effort }) }
}
