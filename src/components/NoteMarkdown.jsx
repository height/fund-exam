import { renderSVGMarkdown } from '../lib/svgMarkdown'
import { useMemo } from 'react'
import MarkdownIt from 'markdown-it'
import mark from 'markdown-it-mark'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import DOMPurify from 'dompurify'
import NoteVisuals from './NoteVisuals'

const md = new MarkdownIt({ html: true, breaks: true, linkify: true })
  .use(mark).use(texmath, { engine: katex, delimiters: 'dollars', katexOptions: { output: 'mathml', trust: false, throwOnError: false, maxExpand: 1000, maxSize: 20 } })
const fence = md.renderer.rules.fence
md.renderer.rules.fence = (tokens, i, options, env, self) => tokens[i].info.trim().toLowerCase() === 'svg'
  ? tokens[i].content : fence(tokens, i, options, env, self)

function render(text) {
  const clean = DOMPurify.sanitize(renderSVGMarkdown(text, value => md.render(value)), {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true },
    FORBID_TAGS: ['style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'foreignObject', 'animate', 'animateMotion', 'animateTransform', 'set'],
    FORBID_ATTR: ['style', 'srcset'],
    // KaTeX's source annotation is a fallback, not a second visible formula.
    ADD_FORBID_CONTENTS: ['annotation', 'annotation-xml'],
  })
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  // SVG is a static illustration; never fetch external SVG resources or navigate from it.
  doc.querySelectorAll('svg').forEach(svg => {
    svg.setAttribute('role', 'img')
    if (!svg.querySelector('title') && !svg.hasAttribute('aria-label')) svg.setAttribute('aria-label', '笔记辅助图')
    svg.querySelectorAll('*').forEach(el => {
      for (const attr of [...el.attributes]) {
        if ((/^(href|xlink:href)$/i.test(attr.name) && !attr.value.startsWith('#')) || (/url\s*\(/i.test(attr.value) && !/^url\(#[\w-]+\)$/.test(attr.value))) el.removeAttribute(attr.name)
      }
    })
  })
  doc.querySelectorAll('a').forEach(a => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer') })
  doc.querySelectorAll('img').forEach(img => {
    img.setAttribute('loading', 'lazy'); img.setAttribute('referrerpolicy', 'no-referrer')
    const src = img.getAttribute('src') || ''
    if (!/^(https?:\/\/|\/[^/]|\.\.?\/|data:image\/(png|jpeg|gif|webp);base64,)/i.test(src)) img.removeAttribute('src')
  })
  return doc.body.innerHTML
}

export default function NoteMarkdown({ note }) {
  const text = note.markdown || note.points.join('\n\n')
  const html = useMemo(() => render(text), [text])
  return <><div className="nb-markdown" dangerouslySetInnerHTML={{ __html: html }} />{!note.markdown && <NoteVisuals note={note} />}</>
}
