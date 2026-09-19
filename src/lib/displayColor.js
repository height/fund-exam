// Keep browser chrome in sync with the same sRGB filter used by the document.
export const EYE_COMFORT = { brightness: .82, saturation: .85, sepia: .12 }
export const EYE_COMFORT_FILTER = `brightness(${EYE_COMFORT.brightness}) saturate(${EYE_COMFORT.saturation}) sepia(${EYE_COMFORT.sepia})`

export function displayBackground(hex, eyeComfort) {
  if (!eyeComfort) return hex
  const { brightness, saturation, sepia } = EYE_COMFORT
  const rgb = hex.replace('#', '').match(/.{2}/g).map(channel => parseInt(channel, 16) / 255 * brightness)
  const gray = rgb[0] * .213 + rgb[1] * .715 + rgb[2] * .072
  const saturated = rgb.map(channel => gray + saturation * (channel - gray))
  const matrix = [[.393, .769, .189], [.349, .686, .168], [.272, .534, .131]]
  const result = matrix.map((row, i) => {
    const tinted = row.reduce((sum, weight, j) => sum + weight * saturated[j], 0)
    return Math.round(Math.max(0, Math.min(1, saturated[i] * (1 - sepia) + tinted * sepia)) * 255)
  })
  return '#' + result.map(channel => channel.toString(16).padStart(2, '0')).join('')
}
