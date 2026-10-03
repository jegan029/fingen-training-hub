import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, Check, Circle, Printer, Target } from 'lucide-react'
import { fetchCertificate } from '../api'
import type { CertificateStatus } from '../types'
import Skeleton from '../components/ui/Skeleton'
import StateMessage from '../components/ui/StateMessage'
import { meterStyle } from '../lib/motion'
import page from '../styles/page.module.css'
import styles from './Certificate.module.css'

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function Requirements({ cert }: { cert: CertificateStatus }) {
  const avg = cert.average_score
  const scoreMet = avg !== null && avg >= cert.min_average_score
  return (
    <div className={`${page.card} ${styles.requirements}`}>
      <span className={styles.bigIcon}>
        <Target size={28} aria-hidden="true" />
      </span>
      <h1 className={page.title}>Certificate not yet earned</h1>
      <p className={page.lead}>
        Mark every topic in all three paths as done and keep your open ended assessment average at{' '}
        {cert.min_average_score} or above. Skipped topics do not count.
      </p>

      <h2 className={styles.listTitle}>Still to do</h2>
      <ul className={styles.missing}>
        {cert.missing.map((m) => (
          <li key={m}>
            <Circle size={14} aria-hidden="true" /> {m}
          </li>
        ))}
      </ul>

      <div className={styles.progress}>
        {cert.paths.map((p) => {
          const pct = p.total ? Math.round((p.completed / p.total) * 100) : 0
          const done = p.completed === p.total
          return (
            <div key={p.path_id}>
              <div className={styles.progressHead}>
                <span className={styles.progressTitle}>{p.title}</span>
                <span className={done ? styles.ok : page.muted}>
                  {done ? (
                    <>
                      <Check size={14} aria-hidden="true" /> Complete
                    </>
                  ) : (
                    `${p.completed} of ${p.total}`
                  )}
                </span>
              </div>
              <span
                className={page.bar}
                role="progressbar"
                aria-label={`${p.title} progress`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={pct}
              >
                <span className={`${page.fill} ${done ? page.fillSuccess : ''}`} style={meterStyle(pct)} />
              </span>
            </div>
          )
        })}
        <div className={styles.progressHead}>
          <span className={styles.progressTitle}>Assessment average</span>
          <span className={scoreMet ? styles.ok : page.muted}>
            {avg === null
              ? 'No scores yet'
              : `${avg} of 10 across ${cert.assessed_nodes} ${cert.assessed_nodes === 1 ? 'topic' : 'topics'}`}
          </span>
        </div>
      </div>

      <div className={page.actions}>
        <Link to="/" className={`${page.btn} ${page.btnPrimary}`}>
          Continue training
        </Link>
        <Link to="/roadmaps" className={page.btn}>
          All training paths
        </Link>
      </div>
    </div>
  )
}

function EarnedCertificate({ cert }: { cert: CertificateStatus }) {
  return (
    <>
      <div className={`${styles.toolbar} no-print`}>
        <button type="button" onClick={() => window.print()} className={`${page.btn} ${page.btnPrimary}`}>
          <Printer size={16} aria-hidden="true" /> Print certificate
        </button>
      </div>

      <article className={styles.certificate} aria-label="Certificate of completion">
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <span key={c} className={`${styles.corner} ${styles[c]}`} aria-hidden="true" />
        ))}
        <span className={styles.seal}>
          <Award size={40} aria-hidden="true" />
        </span>
        <p className={styles.kicker}>Certificate of completion</p>
        <h1 className={styles.org}>FinGen Training Hub</h1>
        <p className={styles.programme}>Fingen Platform Onboarding Programme</p>

        <p className={styles.certifies}>This certifies that</p>
        <p className={styles.name}>{cert.user_name}</p>
        <p className={styles.certifies}>
          has completed all three Fingen L2 training paths with an assessment average of {cert.average_score} out of 10
        </p>

        <ul className={styles.paths}>
          {cert.paths.map((p) => (
            <li key={p.path_id}>
              <Check size={14} aria-hidden="true" /> {p.title}
            </li>
          ))}
        </ul>

        {cert.awarded_on && <p className={styles.date}>Awarded on {formatDate(cert.awarded_on)}</p>}

        <div className={styles.signatures}>
          {[
            { role: 'Head of L2 Support', name: 'FinGen Support Operations' },
            { role: 'Account Manager', name: 'Fingen Client Success' },
          ].map((sig) => (
            <div key={sig.role} className={styles.signature}>
              <p className={styles.sigName}>{sig.name}</p>
              <p className={styles.sigRole}>{sig.role}</p>
            </div>
          ))}
        </div>
      </article>

      <p className={`${styles.back} no-print`}>
        <Link to="/">Back to home</Link>
      </p>
    </>
  )
}

export default function Certificate() {
  const [cert, setCert] = useState<CertificateStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCertificate()
      .then(setCert)
      .catch((err: Error) => setError(err.message || 'Could not load your certificate'))
  }, [])

  return (
    <div className={`${page.page} ${page.narrow}`}>
      {error ? (
        <StateMessage
          tone="error"
          title="Could not check your certificate"
          action={
            <button type="button" className={page.btn} onClick={() => window.location.reload()}>
              Try again
            </button>
          }
        >
          {error}
        </StateMessage>
      ) : !cert ? (
        <Skeleton lines={6} height={28} label="Checking your certificate" />
      ) : cert.eligible ? (
        <EarnedCertificate cert={cert} />
      ) : (
        <Requirements cert={cert} />
      )}
    </div>
  )
}
