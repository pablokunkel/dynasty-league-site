import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  useManifest,
  useNews,
  usePlayers,
  usePoints,
  useSeason,
} from '../lib/data'
import type { Player, Team } from '../lib/types'
import { pts1, record, relativeTime } from '../lib/format'
import {
  Card,
  EmptyState,
  PageHeader,
  PlayerLink,
  PositionBadge,
  SectionTitle,
  StatTile,
  TeamLink,
  Td,
  Th,
  TableWrap,
} from '../components/ui'
import { ClockIcon } from '../components/icons'
import { Standings, Tankathon } from '../components/LeagueTables'

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

/**
 * Sleeper reports rookies two ways and neither is complete on its own: `exp` is
 * missing for some draft-class players, `rookieYear` for others.
 */
const isRookie = (p: Player, season: string) =>
  p.exp === 0 || p.rookieYear === season

/** Team name + projected points, sized to survive a long name in a tile. */
function TeamTileValue({ team }: { team: (Team & { projected: number }) | undefined }) {
  if (!team) return <>—</>
  return (
    <TeamLink
      rosterId={team.rosterId}
      name={team.name}
      avatar={team.avatar}
      size={22}
      className="max-w-full text-base"
    />
  )
}

/** Position badge + clickable player name, ditto. */
function PlayerTileValue({
  entry,
}: {
  entry: { id: string; player: Player } | undefined
}) {
  if (!entry) return <>—</>
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PositionBadge pos={entry.player.pos} />
      <PlayerLink id={entry.id} className="min-w-0 truncate text-base">
        {entry.player.name}
      </PlayerLink>
    </span>
  )
}

export default function Home() {
  const manifest = useManifest()
  const season = useSeason(manifest.currentSeason)
  const players = usePlayers()
  const points = usePoints()
  const news = useNews()

  const hasGames = season.teams.some((t) => t.wins + t.losses + t.ties > 0)

  /*
   * Standings and the tankathon need a season that has actually been played.
   * `manifest.seasons` is newest-first, so this is the live season once it
   * starts and the most recently completed one during the offseason. When they
   * coincide, `useSeason` hits the same cached promise and no extra fetch
   * happens.
   */
  const statsSeasonYear =
    manifest.seasons.find((s) => s.matchupWeekCount > 0)?.season ?? manifest.currentSeason
  const statsSeason = useSeason(statsSeasonYear)
  const starterCount = season.rosterPositions.filter((p) => p !== 'BN').length

  /** Always projection-ordered — the tiles report projections regardless of hasGames. */
  const byProjection = useMemo(
    () =>
      season.teams
        .map((t) => ({
          ...t,
          projected: projectedStrength(t, points.projections, starterCount),
        }))
        .sort((a, b) => b.projected - a.projected),
    [season.teams, points.projections, starterCount]
  )

  /** Once real games exist, the table becomes W-L standings instead. */
  const standings = useMemo(
    () =>
      hasGames
        ? [...byProjection].sort(
            (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
          )
        : byProjection,
    [byProjection, hasGames]
  )

  /** playerId -> the fantasy team rostering them. */
  const ownerOf = useMemo(() => {
    const m = new Map<string, Team>()
    for (const t of season.teams) for (const id of t.players) m.set(id, t)
    return m
  }, [season.teams])

  /**
   * Projection leaderboard, restricted to positions this league actually
   * rosters so a kicker or defense can never surface here.
   */
  const projectedPlayers = useMemo(() => {
    const active = new Set(manifest.activePositions)
    return Object.entries(points.projections)
      .map(([id, v]) => ({ id, pts: v.pts, player: players[id] }))
      .filter(
        (x): x is { id: string; pts: number; player: Player } =>
          Boolean(x.player) && active.has(x.player?.pos ?? '')
      )
      .sort((a, b) => b.pts - a.pts)
  }, [points.projections, players, manifest.activePositions])

  const topTeam = byProjection[0]
  const bottomTeam = byProjection[byProjection.length - 1]
  const topPlayer = projectedPlayers[0]
  const topRookie = useMemo(
    () => projectedPlayers.find((x) => isRookie(x.player, manifest.currentSeason)),
    [projectedPlayers, manifest.currentSeason]
  )

  /** "412.5 proj · <team>" — the roster line both player tiles share. */
  const playerSub = (entry: { id: string; pts: number } | undefined) => {
    if (!entry) return undefined
    const owner = ownerOf.get(entry.id)
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="tnum shrink-0">{pts1(entry.pts)} proj</span>
        <span className="shrink-0">·</span>
        {owner ? (
          <TeamLink
            rosterId={owner.rosterId}
            name={owner.name}
            showAvatar={false}
            className="min-w-0"
          />
        ) : (
          <span>Free agent</span>
        )}
      </span>
    )
  }

  const newsUpdated = Date.parse(news.fetchedAt)

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
          label="Top projected team"
          value={<TeamTileValue team={topTeam} />}
          sub={
            topTeam
              ? `${pts1(topTeam.projected)} projected starter pts`
              : undefined
          }
          accent="var(--color-teal)"
        />
        <StatTile
          label="Bottom projected team"
          value={<TeamTileValue team={bottomTeam} />}
          sub={
            bottomTeam
              ? `${pts1(bottomTeam.projected)} projected starter pts`
              : undefined
          }
          accent="var(--color-rose)"
        />
        <StatTile
          label="Top projected player"
          value={<PlayerTileValue entry={topPlayer} />}
          sub={playerSub(topPlayer)}
        />
        <StatTile
          label="Top projected rookie"
          value={<PlayerTileValue entry={topRookie} />}
          sub={playerSub(topRookie)}
        />
      </div>

      {/* ------------------------------------------- standings + tankathon */}
      <div className="mb-6 space-y-6">
        <Standings season={statsSeason} seasonYear={statsSeasonYear} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* ------------------------------------------------------ tankathon */}
        <Tankathon
          season={statsSeason}
          seasonYear={statsSeasonYear}
          manifest={manifest}
        />

        {/* ---------------------------------------- pre-season projections */}
        {!hasGames && (
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
                    <TeamLink
                      rosterId={t.rosterId}
                      name={t.name}
                      avatar={t.avatar}
                      size={26}
                      className="font-medium text-ink-2"
                    />
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

          <p className="mt-2 text-[11px] text-ink-5">
            Sorted by the sum of each roster's top {starterCount} projected players for{' '}
            {points.projectionsSeason}. {points.note}
          </p>
        </section>
        )}

        {/* ---------------------------------------------------------- news */}
        <section>
          <SectionTitle
            right={
              Number.isFinite(newsUpdated) ? (
                <span className="text-[11px] text-ink-5">
                  updated {relativeTime(newsUpdated)}
                </span>
              ) : undefined
            }
          >
            Fantasy news
          </SectionTitle>

          {news.items.length ? (
            <Card padded={false}>
              {news.items.map((n, i) => (
                <a
                  key={`${n.link}-${i}`}
                  href={n.link}
                  target="_blank"
                  rel="noreferrer"
                  className={`group block px-3 py-2.5 transition-colors hover:bg-card-2/60 ${
                    i ? 'border-t border-line/60' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-card-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.4px] text-ink-4">
                      {n.source}
                    </span>
                    <span className="text-[11px] text-ink-5">
                      {n.published == null ? 'undated' : relativeTime(n.published)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-medium text-ink-2 group-hover:text-teal">
                    {n.title}
                  </div>
                </a>
              ))}
            </Card>
          ) : (
            <EmptyState
              title="No news right now"
              detail="The feed refreshes with the rest of the site data."
            />
          )}
        </section>
      </div>
    </>
  )
}
