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
  collapsed,
  onToggleCollapsed,
}: {
  manifest: Manifest
  open: boolean
  onClose: () => void
  collapsed: boolean
  onToggleCollapsed: () => void
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
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-line bg-abyss transition-[transform,width] lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'w-[236px] lg:w-[64px]' : 'w-[236px]'}`}
      >
        <div
          className={`flex items-center border-b border-line py-5 ${
            collapsed ? 'px-5 lg:justify-center lg:px-0' : 'px-5'
          }`}
        >
          <div className="min-w-0">
            {/* Collapsed shows just the monogram, and only from lg up — the
                mobile drawer is always full width. */}
            <div className={`text-lg font-extrabold tracking-tight text-ink ${collapsed ? 'lg:hidden' : ''}`}>
              {manifest.siteName}
            </div>
            <div className={`mt-0.5 text-[11px] leading-tight text-ink-5 ${collapsed ? 'lg:hidden' : ''}`}>
              {manifest.siteTagline}
            </div>
            <div className={`hidden text-lg font-extrabold text-teal ${collapsed ? 'lg:block' : ''}`}>
              {manifest.siteName.charAt(0)}
            </div>
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto py-3 ${collapsed ? 'px-3 lg:px-2' : 'px-3'}`}>
          {ITEMS.map(({ to, label, Icon, prefetch: pf }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              onMouseEnter={() => pf?.(manifest).forEach(prefetch)}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `group relative mb-0.5 flex items-center gap-3 rounded-lg py-2.5 text-[13px] font-semibold transition-colors ${
                  collapsed ? 'px-3 lg:justify-center lg:px-0' : 'px-3'
                } ${
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
                  <Icon className={`size-[18px] shrink-0 ${isActive ? 'text-teal' : ''}`} />
                  <span className={collapsed ? 'lg:hidden' : ''}>{label}</span>
                  {to === '/draft' && preDraft && days !== null && (
                    <span
                      className={`ml-auto rounded-full bg-teal/15 px-1.5 py-0.5 text-[10px] font-bold text-teal tnum ${
                        collapsed ? 'lg:hidden' : ''
                      }`}
                    >
                      {days}d
                    </span>
                  )}
                  {/* Collapsed: a dot instead of the day count, so the draft
                      still reads as imminent without the label. */}
                  {to === '/draft' && preDraft && days !== null && collapsed && (
                    <span className="absolute right-1.5 top-1.5 hidden size-1.5 rounded-full bg-teal lg:block" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>

        <button
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={collapsed ? 'Expand' : 'Collapse'}
          className={`hidden items-center gap-2.5 border-t border-line py-2.5 text-[11px] font-semibold text-ink-5 hover:bg-card/60 hover:text-ink-2 lg:flex ${
            collapsed ? 'justify-center px-0' : 'px-5'
          }`}
        >
          <svg
            viewBox="0 0 20 20"
            className={`size-4 shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12.5 5 7.5 10l5 5" />
          </svg>
          {!collapsed && 'Collapse'}
        </button>

        <div
          className={`border-t border-line py-3.5 text-[10px] leading-relaxed text-ink-5 ${
            collapsed ? 'px-5 lg:hidden' : 'px-5'
          }`}
        >
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
