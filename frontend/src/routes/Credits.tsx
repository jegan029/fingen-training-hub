import { IMAGE_CREDITS } from '../lib/credits'
import styles from './Credits.module.css'

export default function Credits() {
  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Image credits</h1>
      <p className={styles.lead}>
        All images are hosted on this site. Photos are used under their licences and credited below.
      </p>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Used for</th>
            <th scope="col">Author</th>
            <th scope="col">Source</th>
            <th scope="col">Licence</th>
          </tr>
        </thead>
        <tbody>
          {IMAGE_CREDITS.map((c) => (
            <tr key={c.usedFor}>
              <td>{c.usedFor}</td>
              <td>{c.author}</td>
              <td>
                {c.sourceUrl ? (
                  <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">
                    {c.source}
                  </a>
                ) : (
                  c.source
                )}
              </td>
              <td>
                {c.licenceUrl ? (
                  <a href={c.licenceUrl} target="_blank" rel="noopener noreferrer">
                    {c.licence}
                  </a>
                ) : (
                  c.licence
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
