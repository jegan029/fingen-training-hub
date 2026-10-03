import { useEffect, useRef } from 'react'
import Picture from '../Picture'
import { prefersReducedMotion } from '../../lib/motion'
import { useMediaQuery } from '../../lib/useMediaQuery'
import Constellation from './Constellation'
import styles from './LoginScene.module.css'

/**
 * Background of the sign in brand panel: a slowly drifting navy to violet mesh, the operator photo
 * under a contrast overlay, and the curriculum constellation. Decorative and hidden from assistive
 * technology. Every loop pauses while the tab is hidden; parallax runs only on wide screens with a
 * fine pointer and motion allowed, writing two custom properties at most once per frame.
 */
export default function LoginScene() {
  const root = useRef<HTMLDivElement>(null)
  // Phones show the mesh only, so they never download the photo.
  const showPhoto = useMediaQuery('(min-width: 768px)')

  useEffect(() => {
    const el = root.current
    if (!el) return
    const sync = () => {
      if (document.hidden) el.dataset.paused = ''
      else delete el.dataset.paused
    }
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  useEffect(() => {
    const el = root.current
    const wide = window.matchMedia?.('(min-width: 1024px) and (pointer: fine)')
    if (!el || !wide?.matches || prefersReducedMotion()) return
    let frame = 0
    let x = 0
    let y = 0
    const write = () => {
      frame = 0
      el.style.setProperty('--px', x.toFixed(3))
      el.style.setProperty('--py', y.toFixed(3))
    }
    const onMove = (e: PointerEvent) => {
      x = (e.clientX / window.innerWidth) * 2 - 1
      y = (e.clientY / window.innerHeight) * 2 - 1
      if (!frame) frame = requestAnimationFrame(write)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={root} className={styles.scene} aria-hidden="true">
      <div className={styles.mesh}>
        <span className={styles.blobA} />
        <span className={styles.blobB} />
        <span className={styles.blobC} />
      </div>
      {showPhoto && (
        <div className={styles.photo}>
          <Picture
            photo="signin"
            alt=""
            width={900}
            height={1125}
            sizes="(min-width: 1024px) 58vw, 100vw"
            priority
            className={styles.img}
          />
        </div>
      )}
      <div className={styles.overlay} />
      <div className={styles.constellation}>
        <Constellation />
      </div>
    </div>
  )
}
