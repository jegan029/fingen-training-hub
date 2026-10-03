import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCountUp } from '../../lib/motion'
import UnlockCue from './UnlockCue'
import { celebration, sweepStep, type StatusChange } from './statusChange'

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void
let observe: Callback = () => {}

function mockObserver() {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: Callback) {
        observe = cb
      }
      observe() {}
      disconnect() {}
    },
  )
}

function noReducedMotion() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('celebration', () => {
  const change: StatusChange = {
    nodeId: 1,
    status: 'in_progress',
    nextId: 2,
    unlockedIds: [],
    nextUp: null,
    pathComplete: false,
    message: '',
  }

  it('acknowledges any status change on the changed topic, and only done rings', () => {
    expect(celebration(change, 1)).toBe('changed')
    expect(celebration({ ...change, status: 'done', unlockedIds: [3] }, 1)).toBe('done')
    expect(celebration({ ...change, status: 'skipped', unlockedIds: [3] }, 3)).toBe('unlocked')
    expect(celebration(change, 2)).toBeUndefined()
    expect(celebration(null, 1)).toBeUndefined()
  })

  it('sweeps every other topic when the path is complete', () => {
    const complete = { ...change, status: 'done' as const, pathComplete: true }
    expect(celebration(complete, 1)).toBe('done')
    expect(celebration(complete, 2)).toBe('sweep')
  })

  it('spreads the sweep outward from the topic just completed', () => {
    const nodes = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
    const done = { ...change, nodeId: 3, status: 'done' as const, pathComplete: true }
    expect(nodes.map((_, i) => sweepStep(nodes, done, i))).toEqual([2, 1, 0, 1])
  })
})

describe('useCountUp landing', () => {
  it('continues from the number on screen and waits for the delay', async () => {
    noReducedMotion()
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance'] })
    const { result, rerender } = renderHook(({ target, delay }) => useCountUp(target, true, 300, delay), {
      initialProps: { target: 10, delay: 0 },
    })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe(10)

    rerender({ target: 12, delay: 450 })
    await act(async () => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe(10) // still holding during the delay, not reset to 0
    await act(async () => {
      vi.advanceTimersByTime(600)
    })
    expect(result.current).toBe(12)
  })
})

describe('UnlockCue', () => {
  function setup() {
    noReducedMotion()
    mockObserver()
    const target = document.createElement('button')
    target.dataset.nodeId = '2'
    target.scrollIntoView = vi.fn()
    document.body.append(target)
    const onDone = vi.fn()
    const onShow = vi.fn()
    render(<UnlockCue topics={[{ id: 2, title: 'Settlement Flow' }]} onDone={onDone} onShow={onShow} />)
    return { target, onDone, onShow }
  }

  it('offers to show an unlocked topic that is out of view, and moves only when pressed', () => {
    const { target, onShow } = setup()
    expect(screen.queryByRole('button', { name: /unlocked/ })).toBeNull()

    act(() => observe([{ intersectionRatio: 0, boundingClientRect: { top: 2000 } as DOMRect }]))
    const cue = screen.getByRole('button', { name: 'Settlement Flow unlocked Show' })
    expect(target.scrollIntoView).not.toHaveBeenCalled()

    fireEvent.click(cue)
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    expect(target).toHaveFocus()
    expect(onShow).toHaveBeenCalledWith(2)
  })

  it('retires as soon as the topic is visible', async () => {
    vi.useFakeTimers()
    const { onDone } = setup()
    act(() => observe([{ intersectionRatio: 1, boundingClientRect: { top: 100 } as DOMRect }]))
    expect(screen.queryByRole('button', { name: /unlocked/ })).toBeNull()
    await act(async () => {
      vi.advanceTimersByTime(10)
    })
    expect(onDone).toHaveBeenCalled()
  })
})
