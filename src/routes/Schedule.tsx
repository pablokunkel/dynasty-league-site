import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useManifest, useMatchups, useSeason } from '../lib/data'
import type { MatchupSide } from '../lib/types'
import { pts } from '../lib/format'
import {
  Avatar,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  Segmented,
  Select,
} from '../components/ui'

function Side({
  side,
  name,
  avatar,
  won,
  played,
}: {
  side: MatchupSide
  name: string
  avatar: string | null
  won: boolean
  played: boolean
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <Avatar src={avatar} name={name} size={32} />
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          won ? 'font-bold text-ink' : played ? 'text-ink-4' : 'font-medium text-ink-2'
        }`}
      >
        {name}
      </span>
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

  const availableWeeks = matchups.map((m) => m.week)
  const [week, setWeek] = useState<number>(() => {
    const requested = Number(params.get('week'))
    if (requested && availableWeeks.includes(requested)) return requested
    // Default to week 1 until the season is underway, as requested.
    const live =
      seasonParam === manifest.nflState.season ? manifest.nflState.display_week : 1
    return availableWeeks.includes(live) ? live : (availableWeeks[0] ?? 1)
  })

  const setSeason = (v: string) => {
    const next = new URLSearchParams(params)
    next.set('season', v)
    next.delete('week')
    setParams(next, { replace: true })
    setWeek(1)
  }

  const current = matchups.find((m) => m.week === week)
  const playoffStart = season.settings.playoffWeekStart

  if (matchups.length === 0) {
    return (
      <>
        <PageHeader
          title="Schedule"
          subtitle={`${seasonParam}`}
          right={
            <Select
              label="Season"
              value={seasonParam}
              onChange={setSeason}
              options={manifest.seasons.map((s) => ({
                value: s.season,
                label: s.hasSchedule ? s.season : `${s.season} (no schedule)`,
              }))}
            />
          }
        />
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
        right={
          <Select
            label="Season"
            value={seasonParam}
            onChange={setSeason}
            options={manifest.seasons.map((s) => ({
              value: s.season,
              label: s.hasSchedule ? s.season : `${s.season} (no schedule)`,
            }))}
          />
        }
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
        {current?.matchups.map((m, i) => {
          const [a, b] = m.sides
          const played = m.sides.some((s) => s.points > 0)
          const aWon = played && b != null && a != null && a.points > b.points
          const bWon = played && b != null && a != null && b.points > a.points

          return (
            <Card key={i} padded={false} className="overflow-hidden">
              {a && (
                <Side
                  side={a}
                  name={teamsByRoster.get(a.rosterId)?.name ?? `Roster ${a.rosterId}`}
                  avatar={teamsByRoster.get(a.rosterId)?.avatar ?? null}
                  won={aWon}
                  played={played}
                />
              )}
              {b ? (
                <>
                  <div className="border-t border-line" />
                  <Side
                    side={b}
                    name={teamsByRoster.get(b.rosterId)?.name ?? `Roster ${b.rosterId}`}
                    avatar={teamsByRoster.get(b.rosterId)?.avatar ?? null}
                    won={bWon}
                    played={played}
                  />
                </>
              ) : (
                <div className="border-t border-line px-3.5 py-3 text-xs text-ink-5">Bye</div>
              )}
              {played && a && b && (
                <div className="border-t border-line bg-sunken/50 px-3.5 py-1.5 text-[10px] text-ink-5 tnum">
                  margin {pts(Math.abs(a.points - b.points))}
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}
