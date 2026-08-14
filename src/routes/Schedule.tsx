import { Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useManifest, useMatchups, usePlayers, useSeason } from '../lib/data'
import type { MatchupSide, PlayerIndex } from '../lib/types'
import { pts, slotLabel } from '../lib/format'
import {
  Card,
  EmptyState,
  PageHeader,
  PlayerLink,
  PositionBadge,
  SectionTitle,
  Segmented,
  Select,
  TeamLink,
} from '../components/ui'

function Side({
  side,
  name,
  avatar,
  season,
  won,
  played,
}: {
  side: MatchupSide
  name: string
  avatar: string | null
  season: string
  won: boolean
  played: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <TeamLink
        rosterId={side.rosterId}
        name={name}
        season={season}
        avatar={avatar}
        size={32}
        className={`min-w-0 flex-1 text-sm ${
          won ? 'font-bold text-ink' : played ? 'text-ink-4' : 'font-medium text-ink-2'
        }`}
      />
      <span
        className={`shrink-0 text-sm tnum ${
          won ? 'font-bold text-teal' : played ? 'text-ink-4' : 'text-ink-5'
        }`}
      >
        {played ? pts(side.points) : '—'}
      </span>
    </div>
  )
}

/**
 * One team's entry for a single starting slot. `starters` and `startersPoints`
 * are positionally aligned with the non-BN entries of `rosterPositions`, so the
 * caller indexes all three with the same `i`.
 */
function SlotPlayer({
  id,
  points,
  players,
  align,
  won,
  played,
}: {
  id: string | undefined
  points: number | undefined
  players: PlayerIndex
  align: 'left' | 'right'
  won: boolean
  played: boolean
}) {
  const player = id ? players[id] : undefined
  const right = align === 'right'

  if (!id) {
    return (
      <div className={`min-w-0 text-[11px] text-ink-5 ${right ? 'text-right' : ''}`}>Empty</div>
    )
  }

  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 ${right ? 'flex-row-reverse' : ''}`}
    >
      <PositionBadge pos={player?.pos ?? null} />
      <PlayerLink id={id} className="min-w-0 truncate text-[11px] text-ink-2">
        {player?.name ?? `#${id}`}
      </PlayerLink>
      <span
        className={`shrink-0 text-[11px] tnum ${
          won ? 'font-bold text-teal' : played ? 'text-ink-4' : 'text-ink-5'
        }`}
      >
        {played ? pts(points ?? 0) : '—'}
      </span>
    </div>
  )
}

/**
 * Calls `usePlayers()` itself rather than taking the index as a prop, so the
 * 222KB player file is only fetched once someone actually expands a matchup.
 * Rendered inside its own Suspense boundary in `MatchupCard` — suspending at
 * the route level instead would blank the whole page on first expand.
 */
function Lineups({
  a,
  b,
  slots,
  played,
}: {
  a: MatchupSide | undefined
  b: MatchupSide | undefined
  slots: string[]
  played: boolean
}) {
  const players = usePlayers()

  return (
    <div className="border-t border-line bg-sunken/40 py-1.5">
      {slots.map((slot, i) => {
        const ap = a?.startersPoints[i]
        const bp = b?.startersPoints[i]
        const aWon = played && ap != null && bp != null && ap > bp
        const bWon = played && ap != null && bp != null && bp > ap

        return (
          <div
            key={`${slot}-${i}`}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-1"
          >
            <SlotPlayer
              id={a?.starters[i]}
              points={ap}
              players={players}
              align="right"
              won={aWon}
              played={played}
            />
            <span className="w-9 shrink-0 text-center text-[9px] font-bold tracking-wide text-ink-5">
              {slotLabel(slot)}
            </span>
            {b ? (
              <SlotPlayer
                id={b.starters[i]}
                points={bp}
                players={players}
                align="left"
                won={bWon}
                played={played}
              />
            ) : (
              <div className="min-w-0 text-[11px] text-ink-5">—</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function MatchupCard({
  sides,
  season,
  slots,
  nameFor,
  avatarFor,
}: {
  sides: MatchupSide[]
  season: string
  slots: string[]
  nameFor: (rosterId: number) => string
  avatarFor: (rosterId: number) => string | null
}) {
  const [open, setOpen] = useState(false)
  const [a, b] = sides
  const played = sides.some((s) => s.points > 0)
  const aWon = played && a != null && b != null && a.points > b.points
  const bWon = played && a != null && b != null && b.points > a.points

  return (
    <Card padded={false} className="overflow-hidden">
      {a && (
        <Side
          side={a}
          name={nameFor(a.rosterId)}
          avatar={avatarFor(a.rosterId)}
          season={season}
          won={aWon}
          played={played}
        />
      )}
      {b ? (
        <>
          <div className="border-t border-line" />
          <Side
            side={b}
            name={nameFor(b.rosterId)}
            avatar={avatarFor(b.rosterId)}
            season={season}
            won={bWon}
            played={played}
          />
        </>
      ) : (
        <div className="border-t border-line px-3.5 py-3 text-xs text-ink-5">Bye</div>
      )}

      {open && (
        <Suspense
          fallback={
            <div className="border-t border-line bg-sunken/40 px-3.5 py-4 text-[11px] text-ink-5">
              Loading lineups…
            </div>
          }
        >
          <Lineups a={a} b={b} slots={slots} played={played} />
        </Suspense>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between border-t border-line bg-sunken/50 px-3.5 py-1.5 text-[10px] text-ink-5 transition-colors hover:text-ink-2"
      >
        <span className="tnum">
          {played && a && b
            ? `margin ${pts(Math.abs(a.points - b.points))}`
            : played
              ? 'no opponent'
              : 'not played'}
        </span>
        <span className="font-semibold">
          {open ? 'Hide lineups' : 'Compare lineups'}
          <span className="ml-1 inline-block">{open ? '▴' : '▾'}</span>
        </span>
      </button>
    </Card>
  )
}

export default function Schedule() {
  const manifest = useManifest()
  const [params, setParams] = useSearchParams()

  // Default to the most recent season that actually has a published schedule —
  // Sleeper does not publish matchups until a league leaves pre_draft.
  const defaultSeason =
    manifest.seasons.find((s) => s.hasSchedule)?.season ?? manifest.currentSeason
  const seasonParam = params.get('season') ?? defaultSeason

  const season = useSeason(seasonParam)
  const matchups = useMatchups(seasonParam)

  const teamsByRoster = useMemo(
    () => new Map(season.teams.map((t) => [t.rosterId, t])),
    [season.teams]
  )

  /** Starting slots, positionally aligned with each side's `starters` array. */
  const slots = useMemo(
    () => season.rosterPositions.filter((p) => p !== 'BN'),
    [season.rosterPositions]
  )

  const availableWeeks = useMemo(() => matchups.map((m) => m.week), [matchups])

  /**
   * Weeks that actually contain a contest.
   *
   * Sleeper emits a week 18 for every season here containing 12 single-sided
   * entries and no points — verified identical in 2021, 2024 and 2025. It has
   * data, so it appears in `availableWeeks`, but landing there shows twelve
   * "Bye" cards and nothing else. The default must skip it.
   */
  const playedWeeks = useMemo(
    () =>
      matchups
        .filter((m) => m.matchups.some((x) => x.sides.length >= 2))
        .map((m) => m.week),
    [matchups]
  )

  /*
   * Week default, in priority order:
   *   1. an explicit ?week= that exists in this season
   *   2. the live NFL display week, but only while viewing the live season
   *   3. the last week that has a real matchup — a completed season opens on
   *      its championship week, not week 1 and not the empty week 18.
   */
  const weekParam = params.get('week')
  const defaultWeek = useMemo(() => {
    if (availableWeeks.length === 0) return 1
    const requested = Number(weekParam)
    if (requested && availableWeeks.includes(requested)) return requested
    const live = manifest.nflState.display_week
    if (seasonParam === manifest.nflState.season && availableWeeks.includes(live)) return live
    return (
      playedWeeks[playedWeeks.length - 1] ??
      availableWeeks[availableWeeks.length - 1] ??
      1
    )
  }, [availableWeeks, playedWeeks, weekParam, seasonParam, manifest.nflState])

  /*
   * The picked week is scoped to the season it was picked in, so switching
   * seasons falls back to that season's derived default rather than sticking on
   * a stale number (or resetting to week 1).
   */
  const [picked, setPicked] = useState<{ season: string; week: number } | null>(null)
  const week =
    picked && picked.season === seasonParam && availableWeeks.includes(picked.week)
      ? picked.week
      : defaultWeek

  /*
   * Mirror the pick into ?week= so the address bar always describes what's on
   * screen and a specific week can be shared. `replace` keeps the back button
   * meaning "leave this page" rather than stepping back through every week the
   * user clicked.
   */
  const setWeek = (w: number) => {
    setPicked({ season: seasonParam, week: w })
    const next = new URLSearchParams(params)
    next.set('season', seasonParam)
    next.set('week', String(w))
    setParams(next, { replace: true })
  }

  const setSeason = (v: string) => {
    const next = new URLSearchParams(params)
    next.set('season', v)
    next.delete('week')
    setParams(next, { replace: true })
    setPicked(null)
  }

  const current = matchups.find((m) => m.week === week)
  const playoffStart = season.settings.playoffWeekStart

  const seasonSelect = (
    <Select
      label="Season"
      value={seasonParam}
      onChange={setSeason}
      options={manifest.seasons.map((s) => ({
        value: s.season,
        label: s.hasSchedule ? s.season : `${s.season} (no schedule)`,
      }))}
    />
  )

  if (matchups.length === 0) {
    return (
      <>
        <PageHeader title="Schedule" subtitle={`${seasonParam}`} right={seasonSelect} />
        <EmptyState
          title={`No ${seasonParam} schedule published yet`}
          detail={
            <>
              Sleeper doesn't generate regular-season matchups until the league leaves{' '}
              <code className="rounded bg-sunken px-1 text-xs">pre_draft</code>. This page will fill
              in automatically once the draft completes and the league flips to in-season — the
              pipeline picks it up on the next scheduled run. Pick an earlier season above to browse
              history.
            </>
          }
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle={
          <>
            {seasonParam} · week {week}
            {playoffStart && week >= playoffStart && (
              <span className="ml-2 rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-bold text-amber">
                PLAYOFFS
              </span>
            )}
          </>
        }
        right={seasonSelect}
      />

      <div className="mb-5 overflow-x-auto pb-1">
        <Segmented
          size="sm"
          value={week}
          onChange={setWeek}
          options={availableWeeks.map((w) => ({
            value: w,
            label: playoffStart && w >= playoffStart ? `${w}*` : String(w),
          }))}
        />
      </div>
      {playoffStart && (
        <p className="-mt-3 mb-4 text-[11px] text-ink-5">
          * weeks {playoffStart} and later are playoff weeks.
        </p>
      )}

      <SectionTitle right={<span className="text-[11px] text-ink-5">{current?.matchups.length ?? 0} matchups</span>}>
        Week {week}
      </SectionTitle>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {current?.matchups.map((m, i) => (
          <MatchupCard
            key={i}
            sides={m.sides}
            season={seasonParam}
            slots={slots}
            nameFor={(rosterId) => teamsByRoster.get(rosterId)?.name ?? `Roster ${rosterId}`}
            avatarFor={(rosterId) => teamsByRoster.get(rosterId)?.avatar ?? null}
          />
        ))}
      </div>
    </>
  )
}
