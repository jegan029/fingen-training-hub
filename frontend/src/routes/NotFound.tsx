import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import StateMessage from '../components/ui/StateMessage'
import page from '../styles/page.module.css'

export default function NotFound() {
  return (
    <div className={page.page}>
      <StateMessage
        icon={Compass}
        title="Page not found"
        action={
          <Link to="/roadmaps" className={`${page.btn} ${page.btnPrimary}`}>
            Browse training paths
          </Link>
        }
      >
        That address does not match any page. Press Ctrl K to search for a topic or runbook.
      </StateMessage>
    </div>
  )
}
