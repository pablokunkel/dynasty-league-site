import { Suspense, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useManifest, usePlayers, usePoints, useSeason, useWeekly } from '../lib/data'
import { height, pts1 } from '../lib/format'
import { Avatar, PositionBadge } from './ui'

/**
 * Player profile overlay.
 *
 * Mounted once in App.tsx and driven by the `player` search param, so any
 * PlayerLink anywhere in the app opens it without prop drilling or context.
 * The 123KB weekly game log is only fetched once this actually opens.
 */

const HEADSHOT = (id: string) => `https://sleepercdn.com/content/nfl/players/${id}.jpg`
const TEAM_LOGO = (abbr: string) =>
  `https://sleepercdn.com/images/team_logos/nfl/${abbr.toLowerCase()}.png`

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg bg-sunken px-3 py-2">
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 text-lg font-bold tnum" style={{ color: accent ?? 'var(--color-ink)' }}>
        {value}
      </div>
    </div>
  )
}

/** Game log bars. Projected sits behind actual so the gap is readable. */
function GameLog({
  proj,
  act,
  projSeason,
  actSeason,
}: {
  proj: Record<string, number>
  act: Record<string, number>
  projSeason: string
  actSeason: string | null
}) {
  const weeks = useMemo(() => {
    const all = new Set([...Object.keys(proj), ...Object.keys(act)].map(Number))
    return [...all].sort((a, b) => a - b)
  }, [proj, act])

  const max = useMemo(() => {
    const vals = [...Object.values(proj), ...Object.values(act)]
    return vals.length ? Math.max(...vals) : 1
  }, [proj, act])

  if (!weeks.length) {
    return <div className="text-xs text-ink-5">No weekly data for this player.</div>
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-[10px] text-ink-5">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm bg-teal" />
          {actSeason ?? 'prior'} actual
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-sm bg-line" />
          {projSeason} projected
        </span>
      </div>

      <div className="flex items-end gap-1 overflow-x-auto pb-1">
        {weeks.map((w) => {
          const a = act[String(w)] ?? null
          const p = proj[String(w)] ?? null
          return (
            <div key={w} className="flex w-7 shrink-0 flex-col items-center gap-1">
              <div className="relative flex h-24 w-full items-end justify-center gap-[2px]">
                <div
                  className="w-2.5 rounded-t bg-line"
                  style={{ height: `${((p ?? 0) / max) * 100}%` }}
                  title={p != null ? `Week ${w} projected ${p.toFixed(1)}` : undefined}
                />
                <div
                  className="w-2.5 rounded-t bg-teal"
                  style={{ height: `${((a ?? 0) / max) * 100}%` }}
                  title={a != null ? `Week ${w} actual ${a.toFixed(1)}` : undefined}
                />
              </div>
              <span className="text-[9px] text-ink-5 tnum">{w}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ProfileBody({ id, onClose }: { id: string; onClose: () => void }) {
  const manifest = useManifest()
  const players = usePlayers()
  const points = usePoints()
  const weekly = useWeekly()
  const season = useSeason(manifest.currentSeason)

  const player = players[id]
  const log = weekly.players[id] ?? { proj: {}, act: {} }

  // Which fantasy team, if any, rosters this player.
  const owner = useMemo(
    () => season.teams.find((t) => t.players.includes(id)),
    [season.teams, id]
  )

  const actual = points.actuals[id]
  const projected = points.projections[id]

  if (!player) {
    return (
      <div className="p-6">
        <div className="text-ink-2">Unknown player ({id}).</div>
        <button onClick={onClose} className="mt-4 text-xs font-semibold text-teal">
          Close
        </button>
      </div>
    )
  }

  const games = Object.keys(log.act).length
  const perGame = actual && games ? actual.pts / games : null

  return (
    <>
      <header className="flex items-start gap-4 border-b border-line p-5">
        <div className="relative shrink-0">
          <img
            src={HEADSHOT(id)}
            alt=""
            width={72}
            height={72}
            className="size-[72px] rounded-xl bg-sunken object-cover object-top"
            onError={(e) => {
              // Not every player has a headshot; fall back to the initials chip.
              e.currentTarget.style.display = 'none'
              e.currentTarget.nextElementSibling?.classList.remove('hidden')
            }}
          />
          <div className="hidden">
            <Avatar src={null} name={player.name} size={72} />
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <PositionBadge pos={player.pos} />
            <h2 className="text-xl font-bold leading-tight text-ink">{player.name}</h2>
            {player.injury && (
              <span className="rounded bg-rose/15 px-1.5 py-0.5 text-[10px] font-bold text-rose">
                {player.injury}
              </span>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-4">
            {player.team && (
              <span className="flex items-center gap-1.5">
                <img src={TEAM_LOGO(player.team)} alt="" className="size-4" />
                {player.team}
              </span>
            )}
            {player.num != null && <span>#{player.num}</span>}
            {player.age != null && <span>{player.age}y</span>}
            {height(player.ht) && (
              <span>
                {height(player.ht)}
                {player.wt ? `, ${player.wt}lb` : ''}
              </span>
            )}
            {player.college && <span>{player.college}</span>}
            {player.exp === 0 && <span className="font-semibold text-amber">Rookie</span>}
          </div>

          {owner && (
            <div className="mt-1.5 text-xs">
              <span className="text-ink-5">Rostered by </span>
              <span className="font-semibold text-ink-2">{owner.name}</span>
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-lg p-1.5 text-ink-4 hover:bg-card-2 hover:text-ink"
        >
          <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </header>

      <div className="space-y-5 p-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            label={`${points.actualsSeason ?? 'Prior'} total`}
            value={actual ? pts1(actual.pts) : '—'}
          />
          <Stat label="Per game" value={perGame != null ? pts1(perGame) : '—'} />
          <Stat label="Games" value={games ? String(games) : '—'} />
          <Stat
            label={`${points.projectionsSeason} proj`}
            value={projected ? pts1(projected.pts) : '—'}
            accent="var(--color-teal)"
          />
        </div>

        <div>
          <div className="eyebrow mb-2">Game log</div>
          <GameLog
            proj={log.proj}
            act={log.act}
            projSeason={weekly.projectionsSeason}
            actSeason={weekly.actualsSeason}
          />
        </div>

        <p className="text-[11px] leading-relaxed text-ink-5">
          Points are scored with this league's own settings, not Sleeper's generic PPR.
          Projections are Sleeper's and are season-long — treat them as a baseline, not a
          forecast for any single week.
        </p>
      </div>
    </>
  )
}

export default function PlayerProfile() {
  const [params, setParams] = useSearchParams()
  const id = params.get('player')

  const close = () => {
    const next = new URLSearchParams(params)
    next.delete('player')
    setParams(next, { replace: true })
  }

  // Escape to close, and lock body scroll while open.
  useEffect(() => {
    if (!id) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!id) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:p-8"
      onClick={close}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card my-auto w-full max-w-2xl overflow-hidden p-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Suspense
          fallback={
            <div className="flex items-center gap-2.5 p-10 text-sm text-ink-4">
              <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-line border-t-teal" />
              Loading player…
            </div>
          }
        >
          <ProfileBody id={id} onClose={close} />
        </Suspense>
      </div>
    </div>
  )
}
