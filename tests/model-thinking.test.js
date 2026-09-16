import test from 'node:test'
import assert from 'node:assert/strict'
import { modelThinking } from '../src/lib/modelThinking.js'
test('GLM-5.3 uses only its supported reasoning parameters',()=>{
 assert.equal(modelThinking('glm-5.3',true,'medium').reasoning_effort,'high')
 assert.deepEqual(modelThinking('glm-5.3',false),{thinking:{type:'enabled'},reasoning_effort:'low'})
 assert.equal(modelThinking('glm-5.3',true,'max').reasoning_effort,'max')
 assert.equal(modelThinking('deepseek-v4-pro',false).thinking.type,'disabled')
})

import { thinkingLevels, normalizeThinking } from '../src/lib/modelThinking.js'
import { getThinkingLevel, setThinkingLevel } from '../src/lib/noteThinking.js'
test('all GLM selectors share supported tiers and migrate old values',()=>{
 assert.deepEqual(thinkingLevels('glm-5.3'),['low','high','max'])
 assert.equal(normalizeThinking(null,'glm-5.3'),'high')
 assert.equal(normalizeThinking('medium','glm-5.3'),'high')
 assert.equal(normalizeThinking('off','glm-5.3'),'low')
 assert.equal(normalizeThinking('max','glm-5.3'),'max')
 const data = new Map()
 globalThis.localStorage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)}
 for(const scope of ['note','cheatsheet']){
  assert.equal(getThinkingLevel(scope,'glm-5.3'),'high')
  data.set(`${scope}-thinking-level`,'medium')
  assert.equal(getThinkingLevel(scope,'glm-5.3'),'high')
  setThinkingLevel('off',scope,'glm-5.3')
  assert.equal(getThinkingLevel(scope,'glm-5.3'),'low')
 }
 delete globalThis.localStorage
})
