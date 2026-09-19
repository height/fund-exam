import test from 'node:test'
import assert from 'node:assert/strict'
import { comfortColor } from '../src/lib/displayColor.js'

test('comfort background uses a deterministic native color', () => {
  assert.equal(comfortColor('#f5f5f7'), '#d1cec9')
  assert.equal(comfortColor('#101012'), '#0e0d0e')
  assert.equal(comfortColor('#fff'), comfortColor('#ffffff'))
  assert.equal(comfortColor('rgb(245, 245, 247)'), '#d1cec9')
})

test('translucent theme colors retain their opacity', () => {
  assert.equal(comfortColor('rgba(245, 245, 247, 0.86)'), 'rgba(209, 206, 201, 0.86)')
  assert.equal(comfortColor('#f5f5f700'), 'rgba(209, 206, 201, 0)')
})
