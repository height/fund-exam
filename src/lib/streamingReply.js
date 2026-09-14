// Read only the top-level reply string. Incomplete escapes stay buffered;
// note JSON and nested fields must never appear as conversation text.
export function streamingReply(raw) {
  const source = raw.trimStart().replace(/^```(?:json)?\s*/i, '')
  let depth = 0
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') depth--
    else if (c === '"') {
      const start = i
      for (i++; i < source.length; i++) {
        if (source[i] === '\\') i++
        else if (source[i] === '"') break
      }
      if (i >= source.length) return ''
      if (depth !== 1 || source.slice(start, i + 1) !== '"reply"') continue
      const rest = source.slice(i + 1).match(/^\s*:\s*"/)
      if (!rest) continue
      let result = ''
      for (let j = i + 1 + rest[0].length; j < source.length; j++) {
        if (source[j] === '"') break
        if (source[j] !== '\\') { result += source[j]; continue }
        const escape = source[++j]
        if (!escape) break
        if (escape === 'u') {
          const hex = source.slice(j + 1, j + 5)
          if (!/^[\da-f]{4}$/i.test(hex)) break
          result += String.fromCharCode(parseInt(hex, 16)); j += 4
        } else {
          const chars = { '"': '"', '\\': '\\', '/': '/', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
          if (!(escape in chars)) break
          result += chars[escape]
        }
      }
      return result.replace(/[\uD800-\uDBFF]$/, '')
    }
  }
  return ''
}
