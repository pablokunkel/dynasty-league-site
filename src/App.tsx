import { Component, lazy, Suspense, useState, type ReactNode } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import Nav from './components/Nav'
import { useManifest } from './lib/data'
import { Loading } from './components/ui'

// Route-level splitting: each page is its own chunk, so first paint never pays
// for the eight pages you aren't looking at.
const Home = lazy(() => import('./routes/Home'))
const Draft = lazy(() => import('./routes/Draft'))
const Teams = lazy(() => import('./routes/Teams'))
const Schedule = lazy(() => import('./routes/Schedule'))
const Transactions = lazy(() => import('./routes/Transactions'))
const Waiver = lazy(() => import('./routes/Waiver'))
const Playoffs = lazy(() => import('./routes/Playoffs'))
const Records = lazy(() => import('./routes/Records'))
const Bylaws = lazy(() => import('./routes/Bylaws'))
const NotFound = lazy(() => import('./routes/NotFound'))

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="card m-6 p-6">
          <div className="font-semibold text-rose">Something broke rendering this page.</div>
          <pre className="mt-2 overflow-x-auto text-xs text-ink-4">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 rounded-lg border border-line bg-card-2 px-3 py-1.5 text-xs font-semibold text-ink-2"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function Shell() {
  const manifest = useManifest()
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()

  return (
    <div className="min-h-screen">
      <Nav manifest={manifest} open={navOpen} onClose={() => setNavOpen(false)} />

      {/* Mobile top bar — the nav is permanently visible from lg up. */}
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-abyss/95 px-4 py-3 backdrop-blur lg:hidden">
        <button
          onClick={() => setNavOpen(true)}
          aria-label="Open navigation"
          className="rounded-lg border border-line p-1.5 text-ink-3"
        >
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
            <path d="M3 6h14M3 10h14M3 14h14" />
          </svg>
        </button>
        <span className="font-bold text-ink">{manifest.siteName}</span>
      </div>

      <main className="px-4 py-6 sm:px-6 lg:ml-[236px] lg:px-8 lg:py-8">
        <div className="mx-auto max-w-[1400px]">
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/draft" element={<Draft />} />
                <Route path="/teams" element={<Teams />} />
                <Route path="/schedule" element={<Schedule />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/waiver" element={<Waiver />} />
                <Route path="/playoffs" element={<Playoffs />} />
                <Route path="/records" element={<Records />} />
                <Route path="/bylaws" element={<Bylaws />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Loading label="Loading league" />}>
        <Shell />
      </Suspense>
    </ErrorBoundary>
  )
}
