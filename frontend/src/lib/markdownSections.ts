/**
 * Splits markdown into sections at level 2 headings (`## `), ignoring headings inside code fences.
 * The first section holds anything before the first heading. Joining the sections gives back the input.
 */
export function splitSections(markdown: string): string[] {
  const sections: string[] = []
  let current: string[] = []
  let fence: string | null = null

  for (const line of markdown.split('\n')) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker && (fence === null || marker.startsWith(fence))) {
      fence = fence === null ? marker : null
    }
    if (fence === null && !marker && /^## /.test(line) && current.some((l) => l.trim() !== '')) {
      sections.push(current.join('\n'))
      current = []
    }
    current.push(line)
  }
  sections.push(current.join('\n'))
  return sections.filter((s) => s.trim() !== '')
}
