import type { CSSProperties } from 'react'
import styles from './HeroRoadmap.module.css'

const TOPICS = ['Architecture', 'Access', 'Accounts', 'Transactions', 'Reporting']
const DONE = new Set([0, 1])
const SPINE_X = 180
const NODE_W = 128
const NODE_H = 30
const TOP = 78
const STEP = 56

/** Delay custom property for staggered CSS animations. */
const delay = (ms: number) => ({ '--delay': `${ms}ms` }) as CSSProperties

/**
 * Decorative preview of a roadmap for the hero: the spine draws itself, topics pop in one by one,
 * then the first two turn done. Transform and opacity only; static under prefers-reduced-motion.
 */
export default function HeroRoadmap() {
  return (
    <svg className={styles.preview} viewBox="0 0 360 400" width="360" height="400" aria-hidden="true" focusable="false">
      <rect className={styles.card} x="1" y="1" width="358" height="398" rx="16" />
      <rect className={styles.bar} x="1" y="1" width="358" height="40" rx="16" />
      <rect className={styles.bar} x="1" y="24" width="358" height="17" />
      <circle className={styles.dot} cx="22" cy="21" r="5" />
      <circle className={styles.dot} cx="38" cy="21" r="5" />
      <circle className={styles.dot} cx="54" cy="21" r="5" />
      <text className={styles.barText} x="76" y="26">
        Fingen Platform Core
      </text>

      <rect
        className={styles.spine}
        x={SPINE_X - 2}
        y={TOP}
        width="4"
        height={STEP * (TOPICS.length - 1) + NODE_H}
        rx="2"
      />

      {TOPICS.map((topic, i) => {
        const y = TOP + i * STEP
        const cy = y + NODE_H / 2
        const right = i % 2 === 0
        const branchX = right ? SPINE_X + NODE_W / 2 : SPINE_X - NODE_W / 2
        const pillX = right ? 270 : 10
        const pillEdge = right ? pillX : pillX + 80
        const nodeDelay = 300 + i * 110
        return (
          <g key={topic}>
            <g className={styles.pop} style={delay(nodeDelay + 90)}>
              <path
                className={styles.branch}
                d={`M ${branchX} ${cy} C ${(branchX + pillEdge) / 2} ${cy}, ${(branchX + pillEdge) / 2} ${cy - 10}, ${pillEdge} ${cy - 10}`}
              />
              <rect className={styles.pill} x={pillX} y={cy - 19} width="80" height="18" rx="5" />
              <rect
                className={styles.pillLine}
                x={pillX + 10}
                y={cy - 12}
                width={i % 3 === 0 ? 48 : 60}
                height="4"
                rx="2"
              />
            </g>
            <g className={styles.pop} style={delay(nodeDelay)}>
              <rect className={styles.node} x={SPINE_X - NODE_W / 2} y={y} width={NODE_W} height={NODE_H} rx="8" />
              <text className={styles.nodeText} x={SPINE_X + 6} y={y + 20} textAnchor="middle">
                {topic}
              </text>
            </g>
            {DONE.has(i) && (
              <g className={styles.done} style={delay(1150 + i * 180)}>
                <rect
                  className={styles.doneFill}
                  x={SPINE_X - NODE_W / 2}
                  y={y}
                  width={NODE_W}
                  height={NODE_H}
                  rx="8"
                />
                <text className={styles.doneText} x={SPINE_X + 6} y={y + 20} textAnchor="middle">
                  {topic}
                </text>
                <circle className={styles.check} cx={SPINE_X - NODE_W / 2 + 14} cy={cy} r="8" />
                <path className={styles.checkMark} d={`M ${SPINE_X - NODE_W / 2 + 10} ${cy} l 3 3 l 5 -6`} />
              </g>
            )}
          </g>
        )
      })}
    </svg>
  )
}
