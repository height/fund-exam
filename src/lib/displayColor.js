// Convert shared theme tokens once instead of filtering the document compositor.
// Native browser chrome and page backgrounds then receive the same actual color.
const COMFORT = { brightness: .82, saturation: .85, sepia: .12 }

export function comfortColor(color) {
  let channels, alpha
  if (color.startsWith('#')) {
    let hex = color.slice(1)
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map(c => c + c).join('')
    channels = hex.slice(0, 6).match(/.{2}/g).map(c => parseInt(c, 16))
    if (hex.length === 8) alpha = parseInt(hex.slice(6), 16) / 255
  } else {
    const values = color.match(/[\d.]+/g)?.map(Number)
    if (!values || values.length < 3) return color
    channels = values.slice(0, 3)
    alpha = values[3]
  }
  const { brightness, saturation, sepia } = COMFORT
  const rgb = channels.map(c => c / 255 * brightness)
  const gray = rgb[0] * .213 + rgb[1] * .715 + rgb[2] * .072
  const saturated = rgb.map(c => gray + saturation * (c - gray))
  const matrix = [[.393, .769, .189], [.349, .686, .168], [.272, .534, .131]]
  const result = matrix.map((row, i) => {
    const tinted = row.reduce((sum, weight, j) => sum + weight * saturated[j], 0)
    return Math.round(Math.max(0, Math.min(1, saturated[i] * (1 - sepia) + tinted * sepia)) * 255)
  })
  return alpha === undefined
    ? '#' + result.map(c => c.toString(16).padStart(2, '0')).join('')
    : `rgba(${result.join(', ')}, ${alpha})`
}

export function applyComfortColors(root) {
  const computed = getComputedStyle(root)
  // Snapshot before writing: aliases must not be transformed twice.
  const colors = Array.from(computed).filter(name => name.startsWith('--')).map(name => [name, computed.getPropertyValue(name).trim()])
    .filter(([, value]) => /^(#[\da-f]{3,8}|rgba?\([\d.,\s]+\))$/i.test(value) && CSS.supports('color', value))
  const previous = colors.map(([name]) => [name, root.style.getPropertyValue(name), root.style.getPropertyPriority(name)])
  for (const [name, color] of colors) root.style.setProperty(name, comfortColor(color))
  return () => {
    for (const [name, value, priority] of previous) {
      if (value) root.style.setProperty(name, value, priority)
      else root.style.removeProperty(name)
    }
  }
}
