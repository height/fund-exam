import test from 'node:test'
import assert from 'node:assert/strict'
import MarkdownIt from 'markdown-it'
import { renderSVGMarkdown } from '../src/lib/svgMarkdown.js'
const md=new MarkdownIt({html:true})
const svg='<svg viewBox="0 0 200 80">\n<rect width="200" height="80" fill="white"/>\n\n    <text x="10" y="30">图中文字</text>\n</svg>'
test('SVG blank lines and indentation stay inside the SVG, not Markdown code',()=>{
 const result=renderSVGMarkdown('说明\n\nsvg\n'+svg,t=>md.render(t))
 assert.ok(result.includes(svg))
 assert.ok(!result.includes('<pre>'))
 assert.ok(!result.includes('<p>svg</p>'))
})
test('fenced SVG is handled identically and normal Markdown is preserved',()=>{
 const result=renderSVGMarkdown('**重点**\n\n```svg\n'+svg+'\n```',t=>md.render(t))
 assert.ok(result.includes(svg));assert.ok(result.includes('<strong>重点</strong>'))
})
