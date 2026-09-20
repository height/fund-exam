import { CHEATSHEET_GENERATION_VERSION } from './cheatsheetPrompt'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { askCheatsheet, getCfg } from './ai'
import { createCheatsheetTask } from './cheatsheetTask'
import { cheatsheetFingerprint, loadCheatsheets, saveCheatsheetResult } from './cheatsheetStorage'

export function useCheatsheetTask(storageReady) {
  const [task] = useState(() => createCheatsheetTask({
    load: loadCheatsheets,
    save: saveCheatsheetResult,
    async generate({ subject, notes, effort, prompt, modelConfig, returnUrl }, signal, onProgress) {
      const config = modelConfig || getCfg()
      if (!config.key) throw new Error('请先配置所选 AI 模型，再生成小抄')
      const { notebookPrintHTML } = await import('./notebookPrint')
      const condensed = await askCheatsheet(notes, signal, onProgress, effort, prompt, config)
      const createdAt = Date.now()
      return {
        version: 1, subject, generationVersion: CHEATSHEET_GENERATION_VERSION, notes: condensed, createdAt, sourceCount: notes.length, model: config.model, effort,
        fingerprint: cheatsheetFingerprint(notes),
        html: notebookPrintHTML(condensed, { sourceCount: notes.length, generatedAt: createdAt, returnUrl }),
      }
    },
  }))
  const state = useSyncExternalStore(task.subscribe, task.getSnapshot)
  useEffect(() => { if (storageReady) task.load() }, [task, storageReady])
  return { ...state, task, busy: state.status === 'generating' || state.status === 'saving' }
}
