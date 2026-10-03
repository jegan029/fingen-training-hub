import type { CSSProperties } from 'react'
import type { AnalyticsSummary } from '../../types'
import { meterStyle, useCountUp, useInView } from '../../lib/motion'
import styles from './OnboardingGlance.module.css'

export interface GlanceItem {
  id: number
  title: string
  /** Null when this path's analytics could not be loaded. */
  summary: AnalyticsSummary | null
}

function scoreTone(score: number | null) {
  if (score === null) return styles.neutral
  return score >= 7 ? styles.good : score >= 5 ? styles.fair : styles.poor
}

/**
 * Cohort summary across every path: completion as concentric rings (outer ring first in the legend)
 * with the average counting up in the centre, and the average score per path as bars.
 * The rings are drawn for sighted users; the legend and bars carry the same numbers as text.
 */
export default function OnboardingGlance({ items }: { items: GlanceItem[] }) {
  const loaded = items.filter((i): i is GlanceItem & { summary: AnalyticsSummary } => i.summary !== null)
  const average = loaded.length
    ? Math.round(loaded.reduce((sum, i) => sum + i.summary.completion_rate, 0) / loaded.length)
    : 0
  const shownAverage = useCountUp(average, true)
  // The score bars grow when the chart first scrolls into view.
  const [chartRef, chartInView] = useInView<HTMLDivElement>()

  return (
    <section className={styles.glance} aria-labelledby="glance-title">
      <h2 id="glance-title" className={styles.title}>
        Onboarding at a glance
      </h2>
      <div className={styles.body}>
        <div className={styles.completion}>
          <div className={styles.rings}>
            <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
              {items.map((item, i) => {
                const r = 52 - i * 13
                const rate = Math.round(item.summary?.completion_rate ?? 0)
                return (
                  <g key={item.id} style={{ '--ring': i } as CSSProperties}>
                    <circle className={styles.track} cx={60} cy={60} r={r} />
                    {rate > 0 && (
                      <circle
                        className={styles.arc}
                        data-ring={i}
                        cx={60}
                        cy={60}
                        r={r}
                        pathLength={100}
                        strokeDasharray={100}
                        strokeDashoffset={100 - rate}
                        transform="rotate(-90 60 60)"
                      />
                    )}
                  </g>
                )
              })}
            </svg>
            <div className={styles.centre}>
              <span className={styles.centreValue} aria-hidden="true">
                {shownAverage}%
              </span>
              <span className={styles.centreLabel}>
                <span className={styles.srOnly}>{average}% </span>average completion
              </span>
            </div>
          </div>
          <ul className={styles.legend} aria-label="Completion by path, outer ring first">
            {items.map((item, i) => (
              <li key={item.id}>
                <span className={styles.swatch} data-ring={i} aria-hidden="true" />
                <span className={styles.legendTitle}>{item.title}</span>
                <span className={styles.legendValue}>
                  {item.summary ? `${Math.round(item.summary.completion_rate)}% complete` : 'Unavailable'}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.scores} ref={chartRef}>
          <h3 className={styles.chartTitle}>Average score by path</h3>
          <ul className={styles.bars}>
            {items.map((item) => {
              const score = item.summary?.average_score || null
              return (
                <li key={item.id} className={`${styles.barRow} ${scoreTone(score)}`}>
                  <span className={styles.barLabel}>{item.title}</span>
                  <span className={styles.barValue}>
                    {!item.summary ? 'Unavailable' : score ? `${score.toFixed(1)} of 10` : 'No scores yet'}
                  </span>
                  <span className={styles.barTrack} aria-hidden="true">
                    <span className={styles.barFill} style={meterStyle(chartInView && score ? score * 10 : 0)} />
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </section>
  )
}
