import test from 'node:test'
import assert from 'node:assert/strict'
import { noteFloatPosition } from '../src/lib/noteFloatPosition.js'

const viewport = { x: 0, y: 0, width: 390, height: 844 }
const size = { width: 366, height: 78 }
const bar = { left: 0, right: 390, top: 716, bottom: 844 }
test('默认位置避开底部操作栏和计算器，且不越出屏幕', () => {
  const p = noteFloatPosition(null, size, viewport, [bar, { left: 326, right: 376, top: 650, bottom: 700 }])
  assert.ok(p.y + size.height <= 642)
  assert.ok(p.x >= 8 && p.x + size.width <= 382)
})
test('拖动到边缘或按钮上时夹在屏内并避让，空闲位置保持不变', () => {
  assert.deepEqual(noteFloatPosition({ x: -200, y: -100 }, size, viewport, [bar]), { x: 8, y: 8 })
  assert.deepEqual(noteFloatPosition({ x: 12, y: 100 }, size, viewport, [bar]), { x: 12, y: 100 })
  const p = noteFloatPosition({ x: 9999, y: 9999 }, size, viewport, [bar])
  assert.ok(p.y + size.height <= bar.top - 8)
  assert.ok(p.x + size.width <= viewport.width - 8)
})
test('键盘改变可视区域后仍可见，使用包含偏移的可视视口', () => {
  const p = noteFloatPosition({ x: 16, y: 600 }, size, { ...viewport, y: 120, height: 300 })
  assert.ok(p.y >= 128 && p.y + size.height <= 412)
})
