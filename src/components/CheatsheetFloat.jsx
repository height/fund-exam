import { useRef } from 'react'
import { Icon } from './ui'
import { useNoteFloat } from '../lib/useNoteFloat'
import { useStore } from '../lib/store'
import './CheatsheetFloat.css'

export default function CheatsheetFloat({ generation, go }) {
  const { status, progress, error, task } = generation
  const frame = useRef(null)
  const { toast } = useStore()
  const visible = status !== 'idle'
  useNoteFloat(frame, visible, ',.note-modal-backdrop.is-collapsed')
  if (!visible) return null
  const busy = status === 'generating' || status === 'saving'
  const label = status === 'saving' ? '正在保留小抄…' : status === 'generating'
    ? (progress?.retrying ? '正在重试生成小抄…' : '正在生成小抄…')
    : status === 'error' ? '小抄生成未完成' : '小抄已生成，待保留'
  return <aside ref={frame} className="cs-float" aria-label="小抄生成任务">
    <span className="sr-only" role="status" aria-live="polite">{error || label}</span>
    {busy ? <button className="cs-float-status" onClick={() => go('cheatsheet')} aria-label={`${label}，查看进度`}>
      <span className="cs-float-spinner" aria-hidden="true" />{label}
    </button> : <>
      {status === 'ready' ? <button className="cs-float-keep" title={error || '保留本次生成的小抄'} onClick={async () => { toast(await task.keep() ? '小抄已保留' : '保存失败，请重试保留或打开小抄下载') }}><Icon name="done" />{error ? '重试保留' : '保留'}</button>
        : <button className="cs-float-status" onClick={() => go('cheatsheet')} title={error}><Icon name="list" />生成未完成</button>}
      <button onClick={() => { task.discard(); toast(status === 'ready' ? '已丢弃本次小抄，上次结果仍保留' : '已关闭生成提示') }}><Icon name="x" />{status === 'ready' ? '丢弃' : '关闭'}</button>
      <span className="cs-float-divider" />
      <button className="cs-float-icon" aria-label="重新生成小抄" title="重新生成小抄" onClick={() => task.retry()}><Icon name="refresh" /></button>
      {status === 'ready' && <button className="cs-float-icon" aria-label="查看生成的小抄" title="查看生成的小抄" onClick={() => go('cheatsheet')}><Icon name="chevronRight" /></button>}
    </>}
  </aside>
}
