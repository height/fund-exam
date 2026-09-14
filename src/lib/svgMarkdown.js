// Raw SVG must remain one block: Markdown otherwise parses blank lines and
// indented SVG children as paragraphs/code, separating them from the SVG root.
export function renderSVGMarkdown(markdown, render) {
  const blocks = []
  const text = markdown.replace(/```svg\s*\n([\s\S]*?)```/gi, (_, svg) => svg)
    .replace(/(?:^|\n)svg\s*\n(?=\s*<svg\b)/gi, '\n')
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, svg => {
      const id = blocks.push(svg) - 1
      return `\n\n<div data-note-svg="${id}"></div>\n\n`
    })
  return render(text).replace(/<div data-note-svg="(\d+)"><\/div>/g, (_, id) => blocks[Number(id)] || '')
}
