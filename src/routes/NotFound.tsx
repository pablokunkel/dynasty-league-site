import { Link } from 'react-router-dom'
import { EmptyState, PageHeader } from '../components/ui'

export default function NotFound() {
  return (
    <>
      <PageHeader title="Not found" />
      <EmptyState
        title="No page here"
        detail={
          <Link to="/" className="text-teal hover:underline">
            Back to the league home →
          </Link>
        }
      />
    </>
  )
}
