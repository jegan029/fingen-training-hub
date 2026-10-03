import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { lookupArticle } from '../api'
import Skeleton from '../components/ui/Skeleton'
import StateMessage from '../components/ui/StateMessage'
import page from '../styles/page.module.css'

/** /knowledge/kb/KB0012345: the link form used inside synced article bodies; resolves to the article page. */
export default function KnowledgeByNumber() {
  const { kbNumber = '' } = useParams()
  const [target, setTarget] = useState<number | 'missing' | null>(null)

  useEffect(() => {
    lookupArticle(kbNumber)
      .then((res) => setTarget(res.id))
      .catch(() => setTarget('missing'))
  }, [kbNumber])

  if (target === null) {
    return (
      <div className={page.page}>
        <Skeleton height={36} width="50%" label="Opening article" />
      </div>
    )
  }
  if (target === 'missing') {
    return (
      <div className={page.page}>
        <StateMessage
          icon={FileQuestion}
          title={`${kbNumber} is not available`}
          action={
            <Link to="/knowledge" className={page.btn}>
              Back to the Knowledge Library
            </Link>
          }
        >
          It was not synced to the Training Hub, it was retired, or it is not available at your clearance.
        </StateMessage>
      </div>
    )
  }
  return <Navigate to={`/knowledge/${target}`} replace />
}
