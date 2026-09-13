import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useManifest, useRecaps, useSeason } from '../lib/data'
import type { Recap, RecapPlayer, RecapSide, Team } from '../lib/types'
import { pts, record } from '../lib/format'
import {
  Card,
  EmptyState,
  PageHeader,
  PlayerLink,
  PositionBadge,
  SectionTitle,
  Segmented,
  Select,
  StatTile,
  TeamLink,
  Td,
  Th,
  TableWrap,
} from '../components/ui'

/* ----------------------------------------------------------------- pieces */

function PlayerRef({ p, className = '' }: { p: RecapPlayer; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <PositionBadge pos={p.pos} />
      <PlayerLink id={p.id} className="min-w-0 truncate">
        {p.name}
      </PlayerLink>
      <span className="shrink-0 text-ink-4 tnum">{pts(p.points)}</span>
    </span>
  )
}

/** Score line for one side of a game. Names are frozen in the recap; avatars are looked up live. */
function ScoreRow({
  side,
  team,
  season,
  won,
}: {
  side: RecapSide
  team: Team | undefined
  season: string
  won: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <TeamLink
        rosterId={side.rosterId}
        name={side.name}
        season={season}
        avatar={team?.avatar ?? null}
        size={26}
        className={`min-w-0 flex-1 text-sm ${won ? 'font-bold text-ink' : 'text-ink-4'}`}
      />
      <span className={`shrink-0 text-sm tnum ${won ? 'font-bold text-teal' : 'text-ink-4'}`}>
        {pts(side.points)}
      </span>
    </div>
  )
}

function SideNotes({ side }: { side: RecapSide }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-5">
      {side.topPlayer && (
        <span className="flex min-w-0 items-center gap-1">
          <span className="shrink-0">top</span>
          <PlayerRef p={side.topPlayer} className="text-ink-3" />
        </span>
      )}
      {side.benchLeft > 0 && (
        <span className="shrink-0 tnum" title="Optimal lineup minus actual score">
          {pts(side.benchLeft)} left on bench
        </span>
      )}
    </div>
  )
}

function GameCard({
  game,
  teams,
  season,
  week,
}: {
  game: Recap['games'][number]
  teams: Map<number, Team>
  season: string
  week: number
}) {
  const { winner, loser, tie } = game
  const isTitle = game.label === 'Championship'
  const isLast = game.label === 'Last place game'
  return (
    <Card
      padded={false}
      className={`overflow-hidden ${isTitle ? 'border-amber/50' : isLast ? 'border-rose/40' : ''}`}
    >
      {game.label && (
        <div
          className={`px-4 pt-3 text-[10px] font-bold uppercase tracking-[0.4px] ${
            isTitle ? 'text-amber' : isLast ? 'text-rose' : 'text-ink-5'
          }`}
        >
          {game.label}
        </div>
      )}
      <div className="space-y-2 px-4 pt-3.5">
        <ScoreRow side={winner} team={teams.get(winner.rosterId)} season={season} won={!tie} />
        <ScoreRow side={loser} team={teams.get(loser.rosterId)} season={season} won={false} />
      </div>
      <p className="px-4 pb-3 pt-3 text-sm leading-relaxed text-ink-3">{game.blurb}</p>
      <div className="space-y-1 border-t border-line/60 bg-sunken/40 px-4 py-2.5">
        <SideNotes side={winner} />
        <SideNotes side={loser} />
      </div>
      <Link
        to={`/schedule?season=${season}&week=${week}`}
        className="flex items-center justify-between border-t border-line px-4 py-1.5 text-[10px] text-ink-5 hover:text-ink-2"
      >
        <span className="tnum">{tie ? 'tie' : `margin ${pts(game.margin)}`}</span>
        <span className="font-semibold">Compare lineups →</span>
      </Link>
    </Card>
  )
}

function Movement({ n }: { n: number }) {
  if (n === 0) return <span className="text-ink-5">—</span>
  return (
    <span style={{ color: n > 0 ? 'var(--color-teal)' : 'var(--color-rose)' }} className="font-semibold">
      {n > 0 ? '▲' : '▼'} {Math.abs(n)}
    </span>
  )
}

/* ------------------------------------------------------------------- page */

export default function Recaps() {
  const manifest = useManifest()
  const [params, setParams] = useSearchParams()

  // Open on the newest season that has something to read; the current season
  // has nothing until the Tuesday after week 1.
  const defaultSeason =
    manifest.seasons.find((s) => s.recapCount > 0)?.season ?? manifest.currentSeason
  const seasonParam = params.get('season') ?? defaultSeason

  const recaps = useRecaps(seasonParam)
  const season = useSeason(seasonParam)

  const teams = useMemo(() => new Map(season.teams.map((t) => [t.rosterId, t])), [season.teams])
  const weeks = useMemo(() => recaps.map((r) => r.week), [recaps])

  const requested = Number(params.get('week'))
  const week = weeks.includes(requested) ? requested : (weeks[weeks.length - 1] ?? null)
  const recap = recaps.find((r) => r.week === week)

  const setSeason = (v: string) => {
    const next = new URLSearchParams(params)
    next.set('season', v)
    next.delete('week')
    setParams(next, { replace: true })
  }
  const setWeek = (w: number) => {
    const next = new URLSearchParams(params)
    next.set('season', seasonParam)
    next.set('week', String(w))
    setParams(next, { replace: true })
  }

  const seasonSelect = (
    <Select
      label="Season"
      value={seasonParam}
      onChange={setSeason}
      options={manifest.seasons.map((s) => ({
        value: s.season,
        label: `${s.season} (${s.recapCount})`,
      }))}
    />
  )

  if (!recap) {
    const isCurrent = seasonParam === manifest.currentSeason
    return (
      <>
        <PageHeader title="Recaps" subtitle={seasonParam} right={seasonSelect} />
        <EmptyState
          title={`No ${seasonParam} recaps yet`}
          detail={
            isCurrent && manifest.currentStatus === 'in_season' ? (
              <>
                The first one lands Tuesday morning after week {manifest.nflState.display_week}{' '}
                wraps, once Monday night's scores are final. Every week after that gets its own.
              </>
            ) : (
              <>Recaps are written weekly during the season. Pick another season above to read older ones.</>
            )
          }
        />
      </>
    )
  }

  const a = recap.awards
  const written = new Date(recap.generatedAt)

  return (
    <>
      <PageHeader
        title="Recaps"
        subtitle={
          <>
            {seasonParam} · week {recap.week}
            {recap.isPlayoffs && (
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
          value={recap.week}
          onChange={setWeek}
          options={weeks.map((w) => ({ value: w, label: String(w) }))}
        />
      </div>

      {/* ------------------------------------------------------- headline */}
      <Card className="mb-6 !p-5">
        <h2 className="text-xl font-bold leading-snug tracking-tight text-ink sm:text-2xl">
          {recap.headline}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-3">{recap.summary}</p>
        <div className="mt-3 text-[11px] text-ink-5">
          {recap.author === 'claude' ? 'Written by Claude' : 'Auto-generated'}
          {' · '}
          {written.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </Card>

      {/* --------------------------------------------------------- awards */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatTile
          label="High score"
          value={a.highScore ? pts(a.highScore.points) : '—'}
          sub={a.highScore?.name}
          accent="var(--color-teal)"
        />
        <StatTile
          label="Low score"
          value={a.lowScore ? pts(a.lowScore.points) : '—'}
          sub={a.lowScore?.name}
          accent="var(--color-rose)"
        />
        <StatTile
          label="Closest game"
          value={a.closest ? pts(a.closest.margin) : '—'}
          sub={a.closest ? `${a.closest.winner.name} over ${a.closest.loser.name}` : undefined}
        />
        <StatTile
          label="Biggest blowout"
          value={a.blowout ? pts(a.blowout.margin) : '—'}
          sub={a.blowout ? `${a.blowout.winner.name} over ${a.blowout.loser.name}` : undefined}
        />
        <StatTile
          label="Player of the week"
          value={
            a.topPlayer ? (
              <span className="flex min-w-0 items-center gap-2">
                <PositionBadge pos={a.topPlayer.pos} />
                <PlayerLink id={a.topPlayer.id} className="min-w-0 truncate text-base">
                  {a.topPlayer.name}
                </PlayerLink>
              </span>
            ) : (
              '—'
            )
          }
          sub={a.topPlayer ? `${pts(a.topPlayer.points)} · ${a.topPlayer.team}` : undefined}
        />
        <StatTile
          label="Bench of the week"
          value={a.benchBlunder ? `${pts(a.benchBlunder.left)} left` : '—'}
          sub={
            a.benchBlunder
              ? `${a.benchBlunder.name}${
                  a.benchBlunder.player
                    ? ` · ${a.benchBlunder.player.name} ${pts(a.benchBlunder.player.points)}`
                    : ''
                }`
              : undefined
          }
          accent="var(--color-amber)"
        />
      </div>

      {/* ---------------------------------------------------------- games */}
      <SectionTitle
        right={<span className="text-[11px] text-ink-5">{recap.games.length} games</span>}
      >
        Week {recap.week}
      </SectionTitle>
      <div className="mb-6 grid gap-3 md:grid-cols-2">
        {recap.games.map((g, i) => (
          <GameCard key={i} game={g} teams={teams} season={seasonParam} week={recap.week} />
        ))}
      </div>

      {/* ------------------------------------------------------ standings */}
      {!recap.isPlayoffs && recap.standings.length > 0 && (
        <section>
          <SectionTitle
            right={<span className="text-[11px] text-ink-5">after week {recap.week}</span>}
          >
            Standings
          </SectionTitle>
          <TableWrap>
            <thead>
              <tr>
                <Th className="w-12" align="right">Place</Th>
                <Th>Team</Th>
                <Th className="w-20" align="right">Record</Th>
                <Th className="w-24" align="right">PF</Th>
                <Th className="w-24" align="right">PA</Th>
                <Th className="w-16" align="right">Move</Th>
              </tr>
            </thead>
            <tbody>
              {recap.standings.map((r, i) => (
                <tr
                  key={r.rosterId}
                  className={`border-t border-line/60 hover:bg-card-2/60 ${i % 2 ? 'bg-sunken/25' : ''}`}
                >
                  <Td align="right" className="font-semibold text-ink-4 tnum">{r.place}</Td>
                  <Td>
                    <TeamLink
                      rosterId={r.rosterId}
                      name={r.name}
                      season={seasonParam}
                      avatar={teams.get(r.rosterId)?.avatar ?? null}
                      size={22}
                      className="font-medium text-ink-2"
                    />
                  </Td>
                  <Td align="right" className="font-semibold text-ink-2 tnum">
                    {record(r.wins, r.losses, r.ties)}
                  </Td>
                  <Td align="right" className="text-ink-3 tnum">{pts(r.pointsFor)}</Td>
                  <Td align="right" className="text-ink-5 tnum">{pts(r.pointsAgainst)}</Td>
                  <Td align="right" className="tnum">
                    <Movement n={r.movement} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </section>
      )}

      <p className="mt-4 text-[11px] text-ink-5">
        Team names are as they were that week. "Left on bench" is the optimal lineup minus the
        actual score, the same math behind Max PF.
      </p>
    </>
  )
}
