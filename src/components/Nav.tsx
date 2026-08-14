import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { Manifest } from '../lib/types'
import { prefetch } from '../lib/data'
import { relativeTime } from '../lib/format'
import {
  BylawsIcon,
  DraftIcon,
  HomeIcon,
  PlayoffsIcon,
  RecordsIcon,
  ScheduleIcon,
  TeamsIcon,
  TransactionsIcon,
  WaiverIcon,
} from './icons'

type Item = {
  to: string
  label: string
  Icon: (p: { className?: string }) => React.ReactElement
  /** Files to warm on hover so the route renders instantly when clicked. */
  prefetch?: (m: Manifest) => string[]
}

const ITEMS: Item[] = [
  { to: '/', label: 'Home', Icon: HomeIcon, prefetch: (m) => [`season/${m.currentSeason}.json`, 'trending.json'] },
  { to: '/draft', label: 'Draft', Icon: DraftIcon, prefetch: (m) => [`season/${m.currentSeason}.json`, 'prospects.json'] },
  { to: '/teams', label: 'Teams', Icon: TeamsIcon, prefetch: (m) => [`season/${m.currentSeason}.json`, 'players.json'] },
  { to: '/schedule', label: 'Schedule', Icon: ScheduleIcon, prefetch: (m) => [`matchups/${m.currentSeason}.json`] },
  { to: '/transactions', label: 'Transactions', Icon: TransactionsIcon, prefetch: (m) => [`transactions/${m.currentSeason}.json`, 'players.json'] },
  { to: '/waiver', label: 'Waiver', Icon: WaiverIcon, prefetch: (m) => [`season/${m.currentSeason}.json`, 'trending.json'] },
  { to: '/playoffs', label: 'Playoffs', Icon: PlayoffsIcon, prefetch: () => ['records.json'] },
  { to: '/records', label: 'Records', Icon: RecordsIcon, prefetch: () => ['records.json'] },
  { to: '/bylaws', label: 'Bylaws', Icon: BylawsIcon, prefetch: () => ['bylaws.json'] },
]

/** Days until the draft, or null once it has started. */
function useDaysUntil(iso: string) {
  const [days, setDays] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => {
      const diff = new Date(iso).getTime() - Date.now()
      setDays(diff <= 0 ? null : Math.ceil(diff / 86_400_000))
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [iso])
  return days
}

export default function Nav({
  manifest,
  open,
  onClose,
}: {
  manifest: Manifest
  open: boolean
  onClose: () => void
}) {
  const preDraft = manifest.currentStatus === 'pre_draft'
  const days = useDaysUntil(manifest.draftConfig.startTime)

  return (
    <>
      {/* Mobile scrim */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <nav
        className={`fixed inset-y-0 left-0 z-40 flex w-[236px] flex-col border-r border-line bg-abyss transition-transform lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="border-b border-line px-5 py-5">
          <div className="text-lg font-extrabold tracking-tight text-ink">
            {manifest.siteName}
          </div>
          <div className="mt-0.5 text-[11px] leading-tight text-ink-5">
            {manifest.siteTagline}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {ITEMS.map(({ to, label, Icon, prefetch: pf }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              onMouseEnter={() => pf?.(manifest).forEach(prefetch)}
              className={({ isActive }) =>
                `group relative mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                  isActive
                    ? 'bg-card-2 text-ink'
                    : 'text-ink-4 hover:bg-card/60 hover:text-ink-2'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-teal transition-opacity ${
                      isActive ? 'opacity-100' : 'opacity-0'
                    }`}
                  />
                  <Icon className={`size-[18px] ${isActive ? 'text-teal' : ''}`} />
                  {label}
                  {to === '/draft' && preDraft && days !== null && (
                    <span className="ml-auto rounded-full bg-teal/15 px-1.5 py-0.5 text-[10px] font-bold text-teal tnum">
                      {days}d
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div className="border-t border-line px-5 py-3.5 text-[10px] leading-relaxed text-ink-5">
          <div className="flex items-center gap-1.5">
            <span className="inline-block size-1.5 rounded-full bg-teal" />
            Synced {relativeTime(new Date(manifest.generatedAt).getTime())}
          </div>
          <div className="mt-0.5">
            {manifest.nflState.season} {manifest.nflState.season_type} · week{' '}
            {manifest.nflState.display_week}
          </div>
        </div>
      </nav>
    </>
  )
}
