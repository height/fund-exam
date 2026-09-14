import { CHAPTERS } from '../data/chapters'
import { qById } from './bank'
import { MAX_EXCERPT, UNFILED } from './notebook'

const plain = el => (el?.innerText || el?.textContent || '').trim().replace(/\s+/g, ' ')
const around = (text, excerpt, limit) => {
  const index = text.indexOf(excerpt)
  const start = Math.max(0, index - Math.floor((limit - excerpt.length) / 2))
  return text.slice(start, start + limit)
}

export function captureNote(root, excerpt, subject) {
  const source = root?.closest('[data-note-subject]')
  // 气泡保留原始来源，不能误认成它下面已经切换的题目。
  const bubble = root?.closest('.bubble')
  let container = root
  let qid = source?.dataset.noteQid
  if (!bubble && !qid) {
    while (container && container.id !== 'app') {
      qid = container.querySelector('[data-note-qid]')?.dataset.noteQid
      if (qid) break
      container = container.parentElement
    }
  }
  const q = qid ? qById(qid) : null
  const actualSubject = q?.subject || source?.dataset.noteSubject || subject
  const chapter = q?.chapter || source?.dataset.noteChapter || UNFILED
  const local = plain(root?.closest('p,li,.stem,.explain-body,.bubble-body') || root)
  const context = q ? [q.q, ...q.options.map((o, i) => `${'ABCD'[i]}. ${o}`),
    `正确答案：${'ABCD'[q.answer]}`, q.explain, `所选段落：${around(local, excerpt, 2500)}`].join('\n').slice(0, 12000)
    : [around(local, excerpt, 3000), around(plain(source || root?.closest('article,section,.card') || root), excerpt, 5000)].join('\n').slice(0, 12000)
  return {
    id: crypto.randomUUID(), subject: actualSubject,
    chapter: CHAPTERS[actualSubject]?.includes(chapter) ? chapter : UNFILED,
    chapterLocked: !!(q || source) && CHAPTERS[actualSubject]?.includes(chapter),
    sourceKind: bubble ? 'ai' : q ? 'question' : source ? 'lesson' : 'excerpt',
    evidenceContext: q ? [q.explain || '', `正确答案：${q.options[q.answer]}`].join('\n').slice(0, 12000) : context,
    title: excerpt.slice(0, 32), points: [], excerpt: excerpt.slice(0, MAX_EXCERPT), context,
    sourceTitle: q ? `题目 ${q.id}` : source?.dataset.noteTitle || plain(document.querySelector('#app h1')) || '学习摘录',
    sourceHash: location.hash, sourceQid: q?.id || '',
    createdAt: Date.now(), updatedAt: Date.now(), status: 'pending',
  }
}
