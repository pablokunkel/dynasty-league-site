import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  useManifest,
  usePlayers,
  usePoints,
  useSeason,
  useTrending,
} from '../lib/data'
import type { Team } from '../lib/types'
import { pts1, record } from '../lib/format'
import {
  Avatar,
  Card,
  EmptyState,
  PageHeader,
  PlayerCell,
  SectionTitle,
  StatTile,
  Td,
  Th,
  TableWrap,
} from '../components/ui'
import { ClockIcon, TrendDownIcon, TrendUpIcon } from '../components/icons'

/** Sum of a roster's projected starter points — the pre-season power number. */
function projectedStrength(
  team: Team,
  projections: Record<string, { pts: number }>,
  starterCount: number
) {
  return team.players
    .map((id) => projections[id]?.pts ?? 0)
    .sort((a, b) => b - a)
    .slice(0, starterCount)
    .reduce((a, b) => a + b, 0)
}

export default function Home() {
  const manifest = useManifest()
  const season = useSeason(manifest.currentSeason)
  const players = usePlayers()
  const points = usePoints()
  const trending = useTrending()

  const hasGames = season.teams.some((t) => t.wins + t.losses + t.ties > 0)
  const starterCount = season.rosterPositions.filter((p) => p !== 'BN').length

  const standings = useMemo(() => {
    const withStrength = season.teams.map((t) => ({
      ...t,
      projected: projectedStrength(t, points.projections, starterCount),
    }))
    return hasGames
      ? withStrength.sort(
          (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
        )
      : withStrength.sort((a, b) => b.projected - a.projected)
  }, [season.teams, points.projections, hasGames, starterCount])

  const leader = standings[0]
  const topProjected = useMemo(() => {
    const all = Object.entries(points.projections)
      .map(([id, v]) => ({ id, ...v, player: players[id] }))
      .filter((x) => x.player)
    return all.sort((a, b) => b.pts - a.pts).slice(0, 10)
  }, [points.projections, players])

  const rostered = useMemo(
    () => new Set(season.teams.flatMap((t) => t.players)),
    [season.teams]
  )

  const topFreeAgents = useMemo(
    () =>
      trending.adds
        .filter((t) => !rostered.has(t.id) && players[t.id])
        .slice(0, 10),
    [trending.adds, rostered, players]
  )

  return (
    <>
      <PageHeader
        title={manifest.siteName}
        subtitle={
          hasGames
            ? `${manifest.currentSeason} season · week ${manifest.nflState.display_week}`
            : `${manifest.currentSeason} pre-season · rankings are projections, not results`
        }
      />

      {/* Draft banner while the league is pre-draft */}
      {manifest.currentStatus === 'pre_draft' && (
        <Link
          to="/draft"
          className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-teal/30 bg-teal/[0.07] px-4 py-3.5 transition-colors hover:border-teal/60"
        >
          <ClockIcon className="size-5 text-teal" />
          <div className="flex-1">
            <div className="text-sm font-bold text-ink">
              {manifest.currentSeason} rookie draft ·{' '}
              {new Date(manifest.draftConfig.startTime).toLocaleString(undefined, {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </div>
            <div className="text-xs text-ink-4">
              {manifest.draftConfig.venue.name}
              {manifest.draftConfig.venue.city ? ` · ${manifest.draftConfig.venue.city}` : ''}
            </div>
          </div>
          <span className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-abyss">
            Draft board →
          </span>
        </Link>
      )}

      {/* ------------------------------------------------------------ tiles */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={hasGames ? 'Leader' : 'Top projected roster'}
          value={leader ? leader.name : '—'}
          sub={
            leader
              ? hasGames
                ? `${record(leader.wins, leader.losses, leader.ties)} · ${pts1(leader.pointsFor)} PF`
                : `${pts1(leader.projected)} projected starter pts`
              : undefined
          }
          accent="var(--color-teal)"
        />
        <StatTile
          label="Teams"
          value={season.teams.length}
          sub={`${starterCount} starters · ${season.rosterPositions.length - starterCount} bench`}
        />
        <StatTile
          label="FAAB budget"
          value={`$${season.settings.waiverBudget ?? 0}`}
          sub="per team, per season"
        />
        <StatTile
          label="Playoff field"
          value={season.settings.playoffTeams ?? '—'}
          sub={
            season.settings.playoffWeekStart
              ? `starts week ${season.settings.playoffWeekStart}`
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* ------------------------------------------------------ standings */}
        <section>
          <SectionTitle
            right={
              <Link to="/teams" className="text-[11px] font-semibold text-teal hover:underline">
                All teams →
              </Link>
            }
          >
            {hasGames ? 'Standings' : 'Projected power rankings'}
          </SectionTitle>

          <TableWrap>
            <thead>
              <tr>
                <Th className="w-10" align="right">#</Th>
                <Th>Team</Th>
                {hasGames ? (
                  <>
                    <Th align="right" className="w-20">Record</Th>
                    <Th align="right" className="w-20">PF</Th>
                    <Th align="right" className="w-20">PA</Th>
                  </>
                ) : (
                  <>
                    <Th align="right" className="w-24">Proj. pts</Th>
                    <Th align="right" className="w-16">Players</Th>
                    <Th align="right" className="w-16">Taxi</Th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {standings.map((t, i) => (
                <tr
                  key={t.rosterId}
                  className={`border-t border-line/60 hover:bg-card-2/60 ${
                    i % 2 ? 'bg-sunken/25' : ''
                  }`}
                >
                  <Td align="right" className="text-ink-5 tnum">{i + 1}</Td>
                  <Td>
                    <Link
                      to={`/teams?team=${t.rosterId}`}
                      className="flex items-center gap-2.5 hover:text-teal"
                    >
                      <Avatar src={t.avatar} name={t.name} size={26} />
                      <span className="font-medium text-ink-2">{t.name}</span>
                    </Link>
                  </Td>
                  {hasGames ? (
                    <>
                      <Td align="right" className="font-semibold text-ink-2 tnum">
                        {record(t.wins, t.losses, t.ties)}
                      </Td>
                      <Td align="right" className="text-ink-3 tnum">{pts1(t.pointsFor)}</Td>
                      <Td align="right" className="text-ink-5 tnum">{pts1(t.pointsAgainst)}</Td>
                    </>
                  ) : (
                    <>
                      <Td align="right" className="font-semibold text-ink-2 tnum">
                        {pts1(t.projected)}
                      </Td>
                      <Td align="right" className="text-ink-4 tnum">{t.players.length}</Td>
                      <Td align="right" className="text-ink-5 tnum">{t.taxi.length}</Td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrap>

          {!hasGames && (
            <p className="mt-2 text-[11px] text-ink-5">
              Sorted by the sum of each roster's top {starterCount} projected players for{' '}
              {points.projectionsSeason}. {points.note}
            </p>
          )}
        </section>

        {/* --------------------------------------------------------- aside */}
        <div className="space-y-6">
          <section>
            <SectionTitle
              right={
                <Link to="/waiver" className="text-[11px] font-semibold text-teal hover:underline">
                  Waiver →
                </Link>
              }
            >
              Top free agents
            </SectionTitle>
            {topFreeAgents.length ? (
              <Card padded={false}>
                {topFreeAgents.map((t, i) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 px-3 py-2.5 ${
                      i ? 'border-t border-line/60' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <PlayerCell player={players[t.id]} id={t.id} />
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-teal tnum">
                      <TrendUpIcon className="size-3.5" />
                      {t.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </Card>
            ) : (
              <EmptyState
                title="No unrostered trending players"
                detail="Everyone Sleeper is trending on is already on a roster in this league."
              />
            )}
            <p className="mt-2 text-[11px] text-ink-5">
              Sleeper adds across all leagues in the last 24h, filtered to players free in yours.
            </p>
          </section>

          <section>
            <SectionTitle>
              {hasGames ? 'Upcoming matchups' : `Top projected players · ${points.projectionsSeason}`}
            </SectionTitle>
            {hasGames ? (
              <EmptyState
                title="Schedule view lives on its own page"
                detail={<Link to="/schedule" className="text-teal hover:underline">Open the schedule →</Link>}
              />
            ) : (
              <Card padded={false}>
                {topProjected.map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-3 px-3 py-2.5 ${
                      i ? 'border-t border-line/60' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <PlayerCell player={p.player} id={p.id} />
                    </div>
                    <span className="shrink-0 text-[11px] font-bold text-ink-2 tnum">
                      {pts1(p.pts)}
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </section>

          {trending.drops.length > 0 && (
            <section>
              <SectionTitle>Trending drops</SectionTitle>
              <Card padded={false}>
                {trending.drops.slice(0, 5).map((t, i) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 px-3 py-2.5 ${
                      i ? 'border-t border-line/60' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <PlayerCell player={players[t.id]} id={t.id} showMeta={false} />
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-rose tnum">
                      <TrendDownIcon className="size-3.5" />
                      {t.count.toLocaleString()}
                    </span>
                  </div>
                ))}
              </Card>
            </section>
          )}
        </div>
      </div>
    </>
  )
}
