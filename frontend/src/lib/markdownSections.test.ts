import { describe, expect, it } from 'vitest'
import { splitSections } from './markdownSections'

describe('splitSections', () => {
  it('splits at level 2 headings and keeps the intro', () => {
    const md = 'Intro line\n\n## Overview\nText\n\n## Steps\n1. One\n### Detail\nMore'
    expect(splitSections(md)).toEqual(['Intro line\n', '## Overview\nText\n', '## Steps\n1. One\n### Detail\nMore'])
  })

  it('ignores headings inside code fences', () => {
    const md = '## Query\n```sql\n## not a heading\nSELECT 1;\n```\n## Next\nText'
    expect(splitSections(md)).toEqual(['## Query\n```sql\n## not a heading\nSELECT 1;\n```', '## Next\nText'])
  })

  it('keeps the content intact when joined', () => {
    const md = '## A\nx\n## B\ny'
    expect(splitSections(md).join('\n')).toBe(md)
  })

  it('returns one section when there are no headings', () => {
    expect(splitSections('Just text')).toEqual(['Just text'])
  })
})
