import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Boxes } from 'lucide-react'
import { fetchApplications } from '../api'
import type { ApplicationSummary } from '../types'
import StaleBanner from '../components/knowledge/StaleBanner'
import Skeleton from '../components/ui/Skeleton'
import StateMessage from '../components/ui/StateMessage'
import page from '../styles/page.module.css'
import styles from './Applications.module.css'

export default function Applications() {
  const [apps, setApps] = useState<ApplicationSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchApplications()
      .then(setApps)
      .catch((err: Error) => setError(err.message || 'Could not load applications'))
  }, [])

  return (
    <div className={page.page}>
      <nav aria-label="Breadcrumb">
        <ol className={`${page.crumbs} ${styles.crumbs}`}>
          <li>
            <Link to="/knowledge">Knowledge Library</Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">Applications</li>
        </ol>
      </nav>
      <header className={page.header}>
        <h1 className={page.title}>Applications</h1>
        <p className={page.lead}>
          Runbooks, SOPs and documents grouped by the application they support, as recorded in ServiceNow.
        </p>
      </header>

      <StaleBanner />

      {error ? (
        <StateMessage tone="error" title="Applications could not be loaded">
          {error}
        </StateMessage>
      ) : !apps ? (
        <div className={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={150} label="Loading applications" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <StateMessage icon={Boxes} title="No applications yet">
          Applications appear once articles linked to them are synced from ServiceNow and available at your clearance.
        </StateMessage>
      ) : (
        <ul className={styles.grid}>
          {apps.map((app) => (
            <li key={app.id} className={styles.card}>
              <p className={styles.number}>{app.app_number}</p>
              <h2 className={styles.name}>
                <Link to={`/applications/${app.id}`}>{app.name}</Link>
              </h2>
              {app.description && <p className={styles.desc}>{app.description}</p>}
              <dl className={styles.counts}>
                <div>
                  <dt>Runbooks</dt>
                  <dd>{app.counts.runbooks}</dd>
                </div>
                <div>
                  <dt>SOPs</dt>
                  <dd>{app.counts.sops}</dd>
                </div>
                <div>
                  <dt>Other</dt>
                  <dd>{app.counts.other}</dd>
                </div>
                <div>
                  <dt>Documents</dt>
                  <dd>{app.counts.documents}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
