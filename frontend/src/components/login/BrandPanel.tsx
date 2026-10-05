import { useEffect, useState } from 'react'
import { BookOpen, Bot, Map } from 'lucide-react'
import { fetchPublicStats } from '../../api'
import type { PublicStats } from '../../types'
import Logo from '../Logo'
import { motion, staggerStyle, useCountUp } from '../../lib/motion'
import TipCard from './TipCard'
import styles from './BrandPanel.module.css'

const VALUES = [
  { icon: Map, text: 'Guided learning roadmaps' },
  { icon: BookOpen, text: 'Live runbooks and SOPs from ServiceNow' },
  { icon: Bot, text: 'AI tutor and scenario assessments' },
]

/** One counting number; the final value is in hidden text so screen readers never hear it count. */
function Count({ value, label, active }: { value: number; label: string; active: boolean }) {
  const shown = useCountUp(value, active, 900, 500)
  return (
    <span className={styles.stat}>
      <span className={styles.statValue} aria-hidden="true">
        {shown}
      </span>{' '}
      <span className={styles.srOnly}>{value}</span> {label}
    </span>
  )
}

/** Paths, lessons and runbooks from the public stats endpoint; the line is left out if the call fails. */
function StatsLine({ index }: { index: number }) {
  const [stats, setStats] = useState<PublicStats | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    fetchPublicStats()
      .then((s) => live && setStats(s))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])
  if (failed) return null
  // Holds the line's height while loading, so the tip below does not jump when the counts arrive.
  if (!stats) return <p className={styles.stats} aria-hidden="true" />
  return (
    <p className={`${styles.stats} ${motion.rise}`} style={staggerStyle(index)}>
      <Count value={stats.paths} label="paths" active />
      <Count value={stats.lessons} label="lessons" active />
      <Count value={stats.runbooks} label="runbooks" active />
    </p>
  )
}

/**
 * Left side of the sign in page: who this is for and what it offers, over the animated scene.
 * Below 1024 px only the logo and headline stay (the tablet band); the rest is hidden in CSS.
 * The headline is a tagline, not a heading: the page's one heading is "Welcome back" on the card.
 */
export default function BrandPanel() {
  return (
    <div className={styles.panel}>
      <div className={`${styles.logo} ${motion.rise}`} style={staggerStyle(0)}>
        <Logo tone="light" size={40} />
      </div>

      <div className={styles.story}>
        <p className={`${styles.headline} ${motion.rise}`} style={staggerStyle(1)}>
          Become production ready, faster.
        </p>
        <p className={`${styles.lead} ${motion.rise}`} style={staggerStyle(2)}>
          Structured roadmaps, real runbooks and an AI tutor for L2 support engineers.
        </p>

        <div className={styles.more}>
          <ul className={styles.values}>
            {VALUES.map(({ icon: Icon, text }, i) => (
              <li key={text} className={motion.rise} style={staggerStyle(3 + i)}>
                <Icon size={20} aria-hidden="true" className={styles.valueIcon} />
                {text}
              </li>
            ))}
          </ul>
          <StatsLine index={6} />
          <div className={`${styles.tipWrap} ${motion.rise}`} style={staggerStyle(7)}>
            <TipCard />
          </div>
        </div>
      </div>

      <p className={`${styles.footer} ${motion.fadeIn}`} style={staggerStyle(8)}>
        Internal training platform. Authorised users only.
      </p>
    </div>
  )
}
