/**
 * 触屏取词用的 DOM 文本工具。Range 只用来计算和自绘高亮，不放进系统 Selection，
 * 因此不会唤起 iOS / Android 的复制菜单。所有函数都不依赖 React，其他阅读页可直接复用。
 */

export const SELECTABLE_SELECTOR =
  '.stem,.opt>span,.explain-body,.plain-body,.bubble-body'

const INTERACTIVE_SELECTOR =
  'button,a,input,textarea,select,option,summary,[contenteditable="true"],svg'

const TEXT = typeof Node === 'undefined' ? 3 : Node.TEXT_NODE

export function selectableRoot(target) {
  if (!(target instanceof Element)) target = target?.parentElement
  if (!target) return null
  // 题干/解析需要跨内联节点拖选，因此先返回明确的大容器。
  const explicit = target.closest(SELECTABLE_SELECTOR)
  if (explicit) return explicit
  // 选项文字是唯一允许取词的 button 内容，已在上面命中。
  if (target.closest(INTERACTIVE_SELECTOR)) return null
  const scope = target.closest('#app,.bubble-body')
  if (!scope) return null

  // 普通页面文字取最小的有效容器。例如「今日练习 <b>0</b> 题」返回 span，
  // 不会把左右两组统计一起当成一段文本。
  let node = target
  while (node && node !== scope.parentElement) {
    const directText = [...node.childNodes]
      .some(child => child.nodeType === Node.TEXT_NODE && child.data.trim())
    if (directText) return node
    node = node.parentElement
  }
  return scope.innerText.trim() ? scope : null
}

function textNodes(root) {
  const nodes = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode())) {
    if (node.data) nodes.push(node)
  }
  return nodes
}

export function textOf(root) {
  return textNodes(root).map(n => n.data).join('')
}

/** 把 DOM 边界点换成容器内的 UTF-16 偏移。 */
export function pointIndex(root, node, offset) {
  if (!node || (node !== root && !root.contains(node))) return null
  try {
    const range = document.createRange()
    range.selectNodeContents(root)
    range.setEnd(node, offset)
    return range.toString().length
  } catch {
    return null
  }
}

const distanceToRect = (x, y, rect) => {
  const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
  const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
  return [dy, dx]
}

const nearer = (a, b) => !b || a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])

function characterRect(node, rawOffset) {
  if (!node?.data?.length) return null
  let offset = Math.max(0, Math.min(rawOffset, node.data.length - 1))
  // 不从代理对的中间切开 emoji，否则部分 WebKit 会给出空 rect。
  if (offset > 0 && /[\uDC00-\uDFFF]/.test(node.data[offset]) &&
      /[\uD800-\uDBFF]/.test(node.data[offset - 1])) offset--
  const size = /[\uD800-\uDBFF]/.test(node.data[offset]) &&
    /[\uDC00-\uDFFF]/.test(node.data[offset + 1]) ? 2 : 1
  const range = document.createRange()
  range.setStart(node, offset)
  range.setEnd(node, Math.min(offset + size, node.data.length))
  const rect = [...range.getClientRects()].find(r => r.width > 0 && r.height > 0)
  return rect ? { offset, rect } : null
}

/**
 * 按真实排版矩形找触点下的字符。iOS WebKit 的 caret*FromPoint 在
 * user-select:none 子树里会返回 null，部分 WebView 还会返回上一行的旧 caret；Range
 * rect 不受系统选词开关影响，所以把它作为触屏端的权威结果。
 */
function geometricCaretIndexFromPoint(root, x, y) {
  const nodes = textNodes(root)
  let seen = 0
  let chosen = null
  let chosenDistance = null

  for (const node of nodes) {
    const range = document.createRange()
    range.selectNodeContents(node)
    const rects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0)
    for (const rect of rects) {
      const distance = distanceToRect(x, y, rect)
      if (nearer(distance, chosenDistance)) {
        chosen = { node, base: seen }
        chosenDistance = distance
      }
    }
    seen += node.data.length
  }
  if (!chosen) return null

  // 同一文本节点内的字符按视觉阅读顺序单调排列，可二分到触点所在行/列。
  let low = 0
  let high = chosen.node.data.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    const hit = characterRect(chosen.node, middle)
    if (!hit) { high = middle - 1; continue }
    const rect = hit.rect
    if (y < rect.top || (y <= rect.bottom && x < rect.left)) high = middle - 1
    else if (y > rect.bottom || x > rect.right) low = middle + 1
    else return chosen.base + hit.offset
  }

  // 触点位于字间距或行间时，在二分落点附近取几项，以几何距离兜底。
  let best = null
  let bestDistance = null
  for (let i = Math.max(0, low - 3); i <= Math.min(chosen.node.data.length - 1, low + 3); i++) {
    const hit = characterRect(chosen.node, i)
    if (!hit) continue
    const distance = distanceToRect(x, y, hit.rect)
    if (nearer(distance, bestDistance)) {
      best = hit.offset
      bestDistance = distance
    }
  }
  return best == null ? null : chosen.base + best
}

/** 兼容新的标准 API 和 WebKit 长期提供的 caretRangeFromPoint。 */
export function caretIndexFromPoint(root, x, y) {
  const geometric = geometricCaretIndexFromPoint(root, x, y)
  if (geometric != null) return geometric

  let node
  let offset
  const previousUserSelect = root.style.getPropertyValue('user-select')
  const previousWebkitUserSelect = root.style.getPropertyValue('-webkit-user-select')
  // 没有可测量字符（极少见的复杂内联节点）时才走浏览器 API 兜底。
  root.style.setProperty('user-select', 'text')
  root.style.setProperty('-webkit-user-select', 'text')
  try {
    if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y)
      node = pos?.offsetNode
      offset = pos?.offset
    }
    // WebKit 有些版本会暴露标准方法，却只在私有旧 API 上返回结果；
    // 必须按“有没有取到结果”回退，而不是按“方法是否存在”二选一。
    if (!node && document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y)
      node = range?.startContainer
      offset = range?.startOffset
    }
  } finally {
    if (previousUserSelect) root.style.setProperty('user-select', previousUserSelect)
    else root.style.removeProperty('user-select')
    if (previousWebkitUserSelect) root.style.setProperty('-webkit-user-select', previousWebkitUserSelect)
    else root.style.removeProperty('-webkit-user-select')
  }
  if (!node) return null

  // 某些 WebKit 版本在行尾返回 Element 边界，转成相邻文本节点。
  if (node.nodeType !== TEXT) {
    const children = node.childNodes
    const before = children[Math.max(0, Math.min(offset - 1, children.length - 1))]
    const after = children[Math.max(0, Math.min(offset, children.length - 1))]
    const leaf = lastText(before) || firstText(after)
    if (!leaf) return null
    offset = leaf === lastText(before) ? leaf.data.length : 0
    node = leaf
  }
  return pointIndex(root, node, offset)
}

function firstText(node) {
  if (!node) return null
  if (node.nodeType === TEXT) return node
  for (const child of node.childNodes || []) {
    const found = firstText(child)
    if (found) return found
  }
  return null
}

function lastText(node) {
  if (!node) return null
  if (node.nodeType === TEXT) return node
  const children = node.childNodes || []
  for (let i = children.length - 1; i >= 0; i--) {
    const found = lastText(children[i])
    if (found) return found
  }
  return null
}

export function rangeFromIndexes(root, rawStart, rawEnd) {
  const nodes = textNodes(root)
  const length = nodes.reduce((sum, n) => sum + n.data.length, 0)
  const start = Math.max(0, Math.min(rawStart, length))
  const end = Math.max(start, Math.min(rawEnd, length))
  const locate = index => {
    let seen = 0
    for (const node of nodes) {
      const next = seen + node.data.length
      if (index <= next) return [node, index - seen]
      seen = next
    }
    const last = nodes[nodes.length - 1]
    return last ? [last, last.data.length] : [root, 0]
  }
  const range = document.createRange()
  range.setStart(...locate(start))
  range.setEnd(...locate(end))
  return range
}

const WORD_SEGMENTER = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('zh-CN', { granularity: 'word' })
  : null

function fallbackWord(text, index) {
  if (!text) return { start: 0, end: 0 }
  const at = Math.max(0, Math.min(index, text.length - 1))
  // 英文/数字连续取整词；中文在无 Segmenter 的老设备上稳妥退化为单字。
  if (/[A-Za-z0-9_.%]/.test(text[at])) {
    let start = at
    let end = at + 1
    while (start && /[A-Za-z0-9_.%]/.test(text[start - 1])) start--
    while (end < text.length && /[A-Za-z0-9_.%]/.test(text[end])) end++
    return { start, end }
  }
  return { start: at, end: at + 1 }
}

export function wordAtIndex(root, rawIndex) {
  const text = textOf(root)
  if (!text) return { start: 0, end: 0 }
  const index = Math.max(0, Math.min(rawIndex, text.length - 1))
  if (!WORD_SEGMENTER) return fallbackWord(text, index)
  const segments = [...WORD_SEGMENTER.segment(text)]
  let segment = segments.find(s => index >= s.index && index < s.index + s.segment.length)
  // 点在空格/标点时，优先吸附到紧邻的词，不让用户解释一个空格。
  if (segment && !segment.isWordLike) {
    segment = segments.find(s => s.isWordLike && s.index >= index)
      || [...segments].reverse().find(s => s.isWordLike && s.index < index)
  }
  if (!segment) return fallbackWord(text, index)
  return { start: segment.index, end: segment.index + segment.segment.length }
}

export function wordAtPoint(root, x, y) {
  const index = caretIndexFromPoint(root, x, y)
  return index == null ? null : { ...wordAtIndex(root, index), index }
}

export function selectionText(root, start, end) {
  return rangeFromIndexes(root, start, end).toString().trim().replace(/\s+/g, ' ')
}

export function selectionContext(root) {
  const context = root.closest('p,li,td,.stem,.opt,.bubble-body,.explain-body,.plain-body') || root
  return context.innerText.trim().replace(/\s+/g, ' ').slice(0, 160)
}

/**
 * 取词操作最高 164×32：优先放在选区上方，避免压住正在阅读的词；
 * 顶部空间不足时才借行尾/行首，最后压到下方。桌面原生划选和触屏自绘选区共用这套几何。
 */
export function selectionTipPosition(rects) {
  if (!rects.length) return null
  const first = rects[0]
  const last = rects[rects.length - 1]
  // 文案会随术语变宽；按最大宽度判断左右空间，保证长词省略后也不出屏。
  const width = 164
  const height = 32
  // 工具条仍在选区上方，但贴近到 3px：视觉上不再悬得过高，也不会压住高亮。
  const gap = 3
  const inset = 8
  const safeBottom = innerHeight - 82
  const centerX = clamp((last.left + last.right) / 2, width / 2 + inset, innerWidth - width / 2 - inset)
  if (first.top - gap - height >= inset) {
    return { x: centerX, y: first.top - gap - height, side: 'above' }
  }
  const centerY = clamp(last.top + (last.height - height) / 2, inset, safeBottom - height)
  if (last.right + gap + width <= innerWidth - inset) {
    return { x: last.right + gap, y: centerY, side: 'right' }
  }
  if (first.left - gap - width >= inset) {
    return { x: first.left - gap,
      y: clamp(first.top + (first.height - height) / 2, inset, safeBottom - height), side: 'left' }
  }
  return { x: centerX, y: Math.min(last.bottom + gap, safeBottom - height), side: 'below' }
}

const clamp = (n, min, max) => Math.max(min, Math.min(n, max))

export function selectionGeometry(root, start, end) {
  const range = rangeFromIndexes(root, start, end)
  const rects = [...range.getClientRects()]
    .filter(r => r.width > 0 && r.height > 0)
    .map(r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom,
      width: r.width, height: r.height }))
  if (!rects.length) return { range, rects, startHandle: null, endHandle: null, tip: null }
  const first = rects[0]
  const last = rects[rects.length - 1]
  return {
    range,
    rects,
    // 两端都以所在行的顶部为几何原点。视觉层再把起点圆头钉在 top、
    // 终点圆头钉在 bottom，避免把整只手柄错误地挂到文字底边。
    startHandle: { x: first.left, y: first.top, height: first.height },
    endHandle: { x: last.right, y: last.top, height: last.height },
    tip: selectionTipPosition(rects),
  }
}
