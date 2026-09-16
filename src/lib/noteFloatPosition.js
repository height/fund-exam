const overlaps = (a, b) => a.x < b.right && a.x + a.width > b.left && a.y < b.bottom && a.y + a.height > b.top

// Find the closest visible position that leaves persistent page controls accessible.
export function noteFloatPosition(point, size, viewport, obstacles = []) {
  const minX = viewport.x + 8, minY = viewport.y + 8
  const maxX = Math.max(minX, viewport.x + viewport.width - size.width - 8)
  const maxY = Math.max(minY, viewport.y + viewport.height - size.height - 8)
  const clamp = p => ({ x: Math.max(minX, Math.min(maxX, p.x)), y: Math.max(minY, Math.min(maxY, p.y)) })
  const wanted = clamp(point || { x: maxX, y: maxY })
  const blocked = obstacles.map(r => ({ left: r.left - 8, top: r.top - 8, right: r.right + 8, bottom: r.bottom + 8 }))
  const xs = [wanted.x, minX, maxX, ...blocked.flatMap(r => [r.left - size.width, r.right])]
  const ys = [wanted.y, minY, maxY, ...blocked.flatMap(r => [r.top - size.height, r.bottom])]
  const candidates = xs.flatMap(x => ys.map(y => clamp({ x, y })))
  const clear = candidates.filter(p => !blocked.some(r => overlaps({ ...p, width: size.width, height: size.height }, r)))
  return (clear.length ? clear : [wanted]).sort((a, b) =>
    (a.x - wanted.x) ** 2 + (a.y - wanted.y) ** 2 - (b.x - wanted.x) ** 2 - (b.y - wanted.y) ** 2)[0]
}
