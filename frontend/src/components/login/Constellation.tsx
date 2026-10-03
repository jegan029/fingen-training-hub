import type { CSSProperties } from 'react'
import styles from './Constellation.module.css'

/**
 * The curriculum as a constellation: three spines of ten topics (Platform Core, Transaction Flows,
 * L2 Support Ops), a few of the real prerequisite arcs that skip ahead within a path, and the one
 * cross path dependency (topic 5 is needed by topic 20). Lines draw in once, stars breathe, and the
 * first three Platform Core topics light up green, the same "done" language the roadmap uses.
 * Decorative: the brand panel says the same in words.
 */
const W = 360
const H = 900
const SPINES = 3
const PER_SPINE = 10

function star(spine: number, index: number) {
  return {
    x: 70 + spine * 110 + Math.round(18 * Math.sin(index * 0.9 + spine * 1.7)),
    y: 70 + index * 84 + spine * 14,
  }
}

const stars = Array.from({ length: SPINES }, (_, s) => Array.from({ length: PER_SPINE }, (_, i) => star(s, i)))

// Real non adjacent prerequisites from the dataset, as [spine, from index, to index].
const SKIPS: [number, number, number][] = [
  [0, 0, 5],
  [0, 2, 8],
  [1, 2, 6],
  [1, 0, 7],
  [2, 1, 7],
  [2, 2, 6],
]
const LIT = 3

function line(a: { x: number; y: number }, b: { x: number; y: number }) {
  return `M ${a.x} ${a.y} L ${b.x} ${b.y}`
}

/** A gentle curve that bows outward, so arcs read as skipping ahead rather than crossing the spine. */
function arc(a: { x: number; y: number }, b: { x: number; y: number }, bow: number) {
  const mx = (a.x + b.x) / 2 + bow
  const my = (a.y + b.y) / 2
  return `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`
}

const order = (i: number) => ({ '--i': i }) as CSSProperties

export default function Constellation({ className }: { className?: string }) {
  const cross = arc(stars[0][4], stars[1][9], -50)
  return (
    <svg
      className={`${styles.sky} ${className ?? ''}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      {stars.map((spine, s) =>
        spine
          .slice(1)
          .map((b, i) => (
            <path
              key={`l${s}.${i}`}
              className={styles.line}
              d={line(spine[i], b)}
              pathLength={1}
              style={order(s * 3 + i)}
            />
          )),
      )}
      {SKIPS.map(([s, from, to]) => (
        <path
          key={`a${s}.${from}.${to}`}
          className={styles.arc}
          d={arc(stars[s][from], stars[s][to], s === 2 ? 34 : -34)}
          pathLength={1}
          style={order(12 + from)}
        />
      ))}
      <path className={styles.cross} d={cross} pathLength={1} />

      {stars[0].slice(1, LIT).map((b, i) => (
        <path key={`lit${i}`} className={styles.litLine} d={line(stars[0][i], b)} pathLength={1} style={order(i)} />
      ))}

      {stars.map((spine, s) =>
        spine.map((p, i) => (
          <circle
            key={`s${s}.${i}`}
            className={s === 0 && i < LIT ? styles.lit : styles.star}
            cx={p.x}
            cy={p.y}
            r={s === 0 && i < LIT ? 5 : 3.5}
            style={order(s === 0 && i < LIT ? i : (i * 7 + s * 3) % 13)}
          />
        )),
      )}
    </svg>
  )
}
