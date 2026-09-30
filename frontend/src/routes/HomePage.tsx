import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Award, Flame, PlayCircle } from 'lucide-react'
import { fetchProgressOverview, fetchProgressSummary, fetchRunbooks } from '../api'
import type { ContinueNode, ProgressOverview, ProgressSummary } from '../types'
import Picture from '../components/Picture'
import HeroRoadmap from '../components/HeroRoadmap'
import { illustrations, type PhotoName } from '../assets/images'
import { useCountUp, useInView } from '../lib/motion'
import styles from './HomePage.module.css'

type CardMedia = { photo: PhotoName; alt: string } | { svg: string; alt: string }

const CARD_SIZES = '(max-width: 900px) 100vw, (max-width: 1280px) 30vw, 400px'

const MEDIA: Record<string, CardMedia> = {
  platform: { photo: 'platform', alt: 'An engineer with a tablet in a data centre corridor beside server racks' },
  transactions: {
    svg: illustrations.transactionFlow,
    alt: 'Diagram of the transaction flow: initiation, authorisation, settlement, reconciliation and GL posting',
  },
  support: {
    photo: 'support',
    alt: "A colleague points at a teammate's laptop while they work through a problem together",
  },
  aiTutor: {
    svg: illustrations.aiTutor,
    alt: 'Illustration of a learner asking the AI tutor a question and getting an answer that cites lesson sources',
  },
  assessment: { photo: 'assessment', alt: 'An engineer studies a flow diagram sketched on a whiteboard' },
  analytics: { photo: 'analytics', alt: 'A laptop showing dashboards with line charts, a heat map and a donut chart' },
}

interface Card {
  to: string
  media: CardMedia
  eyebrow: string
  title: string
  desc: string
  cta: string
}

const PATH_CARDS: Card[] = [
  {
    to: '/roadmaps/1',
    media: MEDIA.platform,
    eyebrow: 'Platform',
    title: 'Fingen Platform Fundamentals',
    desc: 'Architecture, services, data models, and the core system knowledge every L2 engineer needs on day one.',
    cta: 'Start path →',
  },
  {
    to: '/roadmaps/2',
    media: MEDIA.transactions,
    eyebrow: 'Transactions',
    title: 'Transaction Flow Mastery',
    desc: 'Follow money from initiation through settlement. Trace, investigate, and resolve transaction failures across payment rails.',
    cta: 'Start path →',
  },
  {
    to: '/roadmaps/3',
    media: MEDIA.support,
    eyebrow: 'Operations',
    title: 'L2 Support Operations',
    desc: 'Escalation procedures, runbook execution, SLA management, and client facing incident communication at scale.',
    cta: 'Start path →',
  },
]

const TOOL_CARDS: Card[] = [
  {
    to: '/chat',
    media: MEDIA.aiTutor,
    eyebrow: 'AI Powered',
    title: 'RAG Grounded AI Tutor',
    desc: 'Ask questions and receive answers grounded in actual runbook and platform content. Powered by retrieval augmented generation, not generic AI.',
    cta: 'Learn more →',
  },
  {
    to: '/assessment/1',
    media: MEDIA.assessment,
    eyebrow: 'Assessment',
    title: 'LLM Evaluated Assessments',
    desc: 'Validate understanding with AI scored open ended questions and real scenario multiple choice challenges drawn from live support situations.',
    cta: 'Learn more →',
  },
  {
    to: '/analytics/1',
    media: MEDIA.analytics,
    eyebrow: 'Analytics',
    title: 'Progress & Performance',
    desc: 'Track completion rates and assessment scores across all training paths. Identify knowledge gaps and focus next learning actions.',
    cta: 'Learn more →',
  },
]

/** Stagger index for CSS animations. */
const stagger = (i: number) => ({ '--i': i }) as CSSProperties

function CardImage({ media }: { media: CardMedia }) {
  if ('svg' in media) {
    return <img src={media.svg} alt={media.alt} width={800} height={450} loading="lazy" decoding="async" />
  }
  return <Picture photo={media.photo} alt={media.alt} sizes={CARD_SIZES} />
}

function CardGrid({ cards }: { cards: Card[] }) {
  const [ref, visible] = useInView<HTMLDivElement>()
  return (
    <div ref={ref} className={styles.grid} data-visible={visible || undefined}>
      {cards.map((c, i) => (
        <Link key={c.to} to={c.to} className={styles.card} style={stagger(i)}>
          <div className={styles.cardImg}>
            <CardImage media={c.media} />
          </div>
          <div className={styles.cardBody}>
            <p className={styles.eyebrow}>{c.eyebrow}</p>
            <p className={styles.cardTitle}>{c.title}</p>
            <p className={styles.cardDesc}>{c.desc}</p>
            <span className={styles.cardLink}>{c.cta}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

function Stat({
  value,
  suffix = '',
  label,
  active,
  index,
}: {
  value: number
  suffix?: string
  label: string
  active: boolean
  index: number
}) {
  const shown = useCountUp(value, active)
  return (
    <div className={styles.stat} style={stagger(index)}>
      {/* Screen readers get the final value, not every intermediate number. */}
      <span className={styles.statValue} aria-hidden="true">
        {shown}
        {suffix}
      </span>
      <span className={styles.srOnly}>
        {value}
        {suffix}
      </span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}

function StatsStrip({ overview, runbooks }: { overview: ProgressOverview | null; runbooks: number | null }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  const lessons = overview?.paths.reduce((sum, p) => sum + p.total, 0) ?? 0
  const active = inView && !!overview && runbooks !== null
  return (
    <section ref={ref} className={styles.stats} aria-label="At a glance">
      <Stat index={0} value={overview?.paths.length ?? 0} label="Training paths" active={active} />
      <Stat index={1} value={lessons} label="Lessons" active={active} />
      <Stat index={2} value={runbooks ?? 0} label="Runbooks" active={active} />
      <Stat index={3} value={overview?.overall_pct ?? 0} suffix="%" label="Your overall progress" active={active} />
    </section>
  )
}

const CONTINUE_LABEL: Record<ContinueNode['reason'], { label: string; cta: string }> = {
  in_progress: { label: 'Continue where you left off', cta: 'Resume' },
  next: { label: 'Up next', cta: 'Start topic' },
  start: { label: 'Start here', cta: 'Start topic' },
}

function ContinueCard({ summary }: { summary: ProgressSummary | null | undefined }) {
  // undefined: still loading (reserve the space); null: request failed (show nothing).
  if (summary === undefined) return <div className={styles.continueSkeleton} aria-hidden="true" />
  const next = summary?.continue_node
  if (!next) {
    return (
      <div className={styles.continue}>
        <span className={styles.continueIcon}>
          <Award size={22} aria-hidden="true" />
        </span>
        <div className={styles.continueText}>
          <p className={styles.continueLabel}>All topics covered</p>
          <p className={styles.continueTitle}>Every topic is done or skipped</p>
          <p className={styles.continueMeta}>Check the certificate page to see whether anything is left.</p>
        </div>
        <Link to="/certificate" className="ss-btn ss-btn-solid ss-btn-sm">
          View certificate
        </Link>
      </div>
    )
  }
  const copy = CONTINUE_LABEL[next.reason]
  return (
    <div className={styles.continue}>
      <span className={styles.continueIcon}>
        <PlayCircle size={22} aria-hidden="true" />
      </span>
      <div className={styles.continueText}>
        <p className={styles.continueLabel}>{copy.label}</p>
        <p className={styles.continueTitle}>{next.title}</p>
        <p className={styles.continueMeta}>{next.path_title}</p>
      </div>
      <Link to={`/roadmaps/${next.path_id}?node=${next.node_id}`} className="ss-btn ss-btn-solid ss-btn-sm">
        {copy.cta}
      </Link>
    </div>
  )
}

function Streak({ days }: { days: number }) {
  if (days < 1) return <p className={styles.profileRole}>No recent activity. Work on a topic to start a streak.</p>
  return (
    <p className={styles.streak}>
      <Flame size={14} aria-hidden="true" /> {days} day{days === 1 ? '' : 's'} in a row
    </p>
  )
}

const RING_R = 30
const RING_C = 2 * Math.PI * RING_R

function ProgressRing({ pct }: { pct: number }) {
  const [ref, inView] = useInView<SVGSVGElement>()
  // The ring starts empty and fills to the real value once visible.
  const offset = inView ? RING_C * (1 - pct / 100) : RING_C
  return (
    <svg
      ref={ref}
      className={styles.ring}
      viewBox="0 0 72 72"
      width="72"
      height="72"
      role="img"
      aria-label={`${pct}% of all topics done`}
    >
      <circle className={styles.ringTrack} cx="36" cy="36" r={RING_R} />
      <circle
        className={styles.ringValue}
        cx="36"
        cy="36"
        r={RING_R}
        strokeDasharray={RING_C}
        strokeDashoffset={offset}
        transform="rotate(-90 36 36)"
      />
      <text className={styles.ringText} x="36" y="41" textAnchor="middle">
        {pct}%
      </text>
    </svg>
  )
}

export default function HomePage() {
  const [overview, setOverview] = useState<ProgressOverview | null>(null)
  const [runbookCount, setRunbookCount] = useState<number | null>(null)
  const [summary, setSummary] = useState<ProgressSummary | null | undefined>(undefined)
  const [tileRef, tileVisible] = useInView<HTMLDivElement>()

  useEffect(() => {
    fetchProgressOverview()
      .then(setOverview)
      .catch(() => {})
    fetchRunbooks()
      .then((r) => setRunbookCount(r.length))
      .catch(() => setRunbookCount(0))
    fetchProgressSummary()
      .then(setSummary)
      .catch(() => setSummary(null))
  }, [])

  return (
    <>
      {/* ══ HERO ══════════════════════════════════════════════ */}
      <section className={styles.hero}>
        <div className={styles.heroArt}>
          {/* Decorative artwork; loaded eagerly because it is above the fold. */}
          <img
            className={styles.heroImg}
            data-hero-art
            src={illustrations.heroDataflow}
            alt=""
            width={1600}
            height={900}
            decoding="async"
            {...{ fetchpriority: 'high' }}
          />
          <div className={styles.heroPreview}>
            <HeroRoadmap />
          </div>
        </div>
        <div className={styles.heroInner}>
          <div className={styles.heroContent}>
            <p className={`${styles.heroEyebrow} ${styles.enter}`} style={stagger(0)}>
              FinGen · L2 Support Training
            </p>
            <h1 className={`${styles.heroTitle} ${styles.enter}`} style={stagger(1)}>
              Engineer Onboarding
              <br />
              Training Hub
            </h1>
            <p className={`${styles.heroDesc} ${styles.enter}`} style={stagger(2)}>
              Structured training paths for L2 support engineers working on the Fingen platform. Master transaction
              flows, build platform knowledge, and execute runbooks with confidence.
            </p>
            <div className={`${styles.heroActions} ${styles.enter}`} style={stagger(3)}>
              <Link to="/roadmaps" className="ss-btn ss-btn-solid ss-btn-lg">
                Browse Training Paths
              </Link>
              <Link to="/chat" className="ss-btn ss-btn-outlined ss-btn-lg">
                Ask AI Tutor
              </Link>
            </div>
          </div>
        </div>
      </section>

      <StatsStrip overview={overview} runbooks={runbookCount} />

      <hr className="ss-divider" />

      {/* ══ IN FOCUS ══════════════════════════════════════════ */}
      <div className="ss-section">
        <div className="ss-section-label">
          <h2>In focus</h2>
        </div>
        <div ref={tileRef} className={styles.tile} data-visible={tileVisible || undefined}>
          <Link to="/roadmaps/1" className={styles.tileImg} aria-label="Start the Fingen Platform Fundamentals path">
            <Picture
              photo="platform"
              alt={MEDIA.platform.alt}
              sizes="(max-width: 900px) 100vw, 650px"
              width={1200}
              height={675}
            />
          </Link>
          <div>
            <p className={styles.eyebrow}>Featured Path</p>
            <p className={styles.tileTitle}>Fingen Platform Fundamentals: what every L2 engineer must know</p>
            <p className={styles.tileDesc}>
              The Fingen platform underpins all transaction processing for the client. This path covers core system
              architecture, data models, key services, and the end to end transaction lifecycle required before
              escalating or resolving any L2 issue.
            </p>
            <Link to="/roadmaps/1" className={styles.learnMore}>
              Start this path →
            </Link>
          </div>
        </div>
      </div>

      <hr className="ss-divider" />

      {/* ══ TRAINING PATHS ════════════════════════════════════ */}
      <div className="ss-section">
        <div className="ss-section-label">
          <h2>Training paths</h2>
          <p>Three structured L2 onboarding programmes</p>
        </div>
        <div>
          <CardGrid cards={PATH_CARDS} />
          <div className={styles.more}>
            <Link to="/roadmaps" className="ss-btn ss-btn-ghost">
              Explore all training paths →
            </Link>
          </div>
        </div>
      </div>

      <hr className="ss-divider" />

      {/* ══ TOOLS AND RESOURCES ═══════════════════════════════ */}
      <div className="ss-section">
        <div className="ss-section-label">
          <h2>Tools &amp; resources</h2>
          <p>AI powered learning support</p>
        </div>
        <CardGrid cards={TOOL_CARDS} />
      </div>

      <hr className="ss-divider" />

      {/* ══ YOUR PROGRESS ═════════════════════════════════════ */}
      {overview && (
        <>
          <div className="ss-section">
            <div className="ss-section-label">
              <h2>Your progress</h2>
              <p>{overview.user_name}</p>
            </div>
            <div>
              <div className={styles.profile}>
                <ProgressRing pct={overview.overall_pct} />
                <div className={styles.profileText}>
                  <p className={styles.profileName}>{overview.user_name}</p>
                  <p className={styles.profileRole}>L2 Support Engineer · Fingen Platform</p>
                  {summary && <Streak days={summary.streak_days} />}
                </div>
                <div className={styles.profileActions}>
                  <Link to="/roadmaps" className="ss-btn ss-btn-ghost ss-btn-sm">
                    All training paths
                  </Link>
                  <Link to="/certificate" className="ss-btn ss-btn-ghost ss-btn-sm">
                    View Certificate
                  </Link>
                </div>
              </div>

              <ContinueCard summary={summary} />

              <div className={styles.pathGrid}>
                {overview.paths.map((p) => (
                  <Link key={p.path_id} to={`/roadmaps/${p.path_id}`} className={styles.pathCard}>
                    <div className={styles.pathHead}>
                      <span className={styles.pathTitle}>{p.title}</span>
                      <span className={styles.pathCount}>
                        {p.completed}/{p.total}
                      </span>
                    </div>
                    <div
                      className={styles.bar}
                      role="progressbar"
                      aria-label={`${p.title} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={p.pct}
                    >
                      <div className={styles.fill} style={{ width: `${p.pct}%` }} />
                    </div>
                    <p className={styles.pathPct}>{p.pct}% complete</p>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <hr className="ss-divider" />
        </>
      )}

      {/* ══ CTA STRIP ═════════════════════════════════════════ */}
      <div className={styles.cta}>
        <div className={styles.ctaInner}>
          <div>
            <h2 className={styles.ctaTitle}>Ready to begin onboarding?</h2>
            <p className={styles.ctaText}>Pick a training path and work through modules at your own pace.</p>
          </div>
          <Link to="/roadmaps" className="ss-btn ss-btn-white ss-btn-lg">
            View all training paths →
          </Link>
        </div>
      </div>
    </>
  )
}
