import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import HomePage from '../routes/HomePage'
import * as api from '../api'
import { photoSources, type PhotoName } from '../assets/images'

describe('home page images', () => {
  it('are self hosted, sized and described', () => {
    vi.spyOn(api, 'fetchProgressOverview').mockReturnValue(new Promise(() => {}))
    vi.spyOn(api, 'fetchRunbooks').mockReturnValue(new Promise(() => {}))
    vi.spyOn(api, 'fetchProgressSummary').mockReturnValue(new Promise(() => {}))
    const { container } = render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
    const images = Array.from(container.querySelectorAll('img'))
    expect(images.length).toBeGreaterThanOrEqual(8)
    for (const img of images) {
      expect(img.getAttribute('src')).not.toMatch(/^https?:/)
      expect(img).toHaveAttribute('width')
      expect(img).toHaveAttribute('height')
      expect(img.hasAttribute('alt')).toBe(true)
    }
    // Only the decorative hero artwork has empty alt text; it is the one image not lazy loaded.
    const decorative = images.filter((i) => i.getAttribute('alt') === '')
    expect(decorative).toHaveLength(1)
    expect(decorative[0]).toHaveAttribute('data-hero-art')
    for (const img of images.filter((i) => i !== decorative[0])) {
      expect(img).toHaveAttribute('loading', 'lazy')
    }
    for (const source of Array.from(container.querySelectorAll('source'))) {
      expect(source.getAttribute('srcset')).not.toContain('undefined')
    }
  })

  it.each<PhotoName>(['platform', 'support', 'assessment', 'analytics'])(
    '%s has AVIF and WebP at every width',
    (name) => {
      const src = photoSources(name)
      for (const set of [src.avif, src.webp]) {
        expect(set.split(', ')).toHaveLength(3)
        expect(set).not.toContain('undefined')
      }
      expect(src.fallback).toBeTruthy()
    },
  )
})
