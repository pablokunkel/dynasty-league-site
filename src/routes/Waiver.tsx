import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useManifest,
  usePlayers,
  usePoints,
  useSeason,
  useTransactions,
  useTrending,
} from '../lib/data'
import { POSITION_ORDER, pts1, relativeTime } from '../lib/format'
import {
  Avatar,
  Card,
  EmptyState,
  PageHeader,
  PlayerMeta,
  PositionBadge,
  SearchInput,
  SectionTitle,
  Segmented,
  Select,
  StatTile,
} from '../components/ui'
import { TrendUpIcon } from '../components/icons'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function Waiver() {
  const manifest = useManifest()
  const [params, setParams] = useSearchParams()
  const seasonParam = params.get('season') ?? manifest.currentSeason

  const season = useSeason(seasonParam)
  const transactions = useTransactions(seasonParam)
  const players = usePlayers()
  const points = usePoints()
  const trending = useTrending()

  const [pos, setPos] = useState('ALL')
  const [query, setQuery] = useState('')

  const budget = season.settings.waiverBudget ?? 0
  const isFaab = season.settings.waiverType === 2

  const teamsByRoster = useMemo(
    () => new Map(season.teams.map((t) => [t.rosterId, t])),
    [season.teams]
  )

  const rostered = useMemo(
    () => new Set(season.teams.flatMap((t) => t.players)),
    [season.teams]
  )

  /** Trending adds that are actually free in this league — the waiver wire. */
  const wire = useMemo(() => {
    const q = query.trim().toLowerCase()
    return trending.adds
      .map((t) => ({ ...t, player: players[t.id] }))
      .filter((t) => {
        if (!t.player || rostered.has(t.id)) return false
        if (pos !== 'ALL' && t.player.pos !== pos) return false
        if (q && !t.player.name.toLowerCase().includes(q)) return false
        return true
      })
  }, [trending.adds, players, rostered, pos, query])

  const claims = useMemo(
    () => transactions.filter((t) => t.type === 'waiver').slice(0, 25),
    [transactions]
  )

  const budgets = useMemo(
    () =>
      season.teams
        .map((t) => ({
          ...t,
          remaining: budget - t.waiverBudgetUsed,
          pctUsed: budget > 0 ? t.waiverBudgetUsed / budget : 0,
        }))
        .sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name)),
    [season.teams, budget]
  )

  const totalSpent = budgets.reduce((a, t) => a + t.waiverBudgetUsed, 0)
  const biggestBid = useMemo(
    () =>
      transactions
        .filter((t) => t.faab != null && t.status === 'complete')
        .sort((a, b) => (b.faab ?? 0) - (a.faab ?? 0))[0],
    [transactions]
  )

  return (
    <>
      <PageHeader
        title="Waiver wire"
        subtitle={
          isFaab
            ? `FAAB · $${budget} per team · clears ${DAYS[(season.settings.waiverDayOfWeek ?? 2) % 7]}`
            : 'Rolling waiver order'
        }
        right={
          <Select
            label="Season"
            value={seasonParam}
            onChange={(v) => {
              const next = new URLSearchParams(params)
              next.set('season', v)
              setParams(next, { replace: true })
            }}
            options={manifest.seasons.map((s) => ({ value: s.season, label: s.season }))}
          />
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="FAAB budget" value={`$${budget}`} sub="per team, per season" />
        <StatTile
          label="Total spent"
          value={`$${totalSpent}`}
          sub={`of $${budget * season.teams.length} leaguewide`}
          accent="var(--color-amber)"
        />
        <StatTile
          label="Biggest bid"
          value={biggestBid?.faab != null ? `$${biggestBid.faab}` : '—'}
          sub={
            biggestBid
              ? Object.keys(biggestBid.adds ?? {})
                  .map((id) => players[id]?.name)
                  .filter(Boolean)
                  .join(', ') || biggestBid.teams.join(', ')
              : 'no bids yet'
          }
        />
        <StatTile
          label="Waiver claims"
          value={transactions.filter((t) => t.type === 'waiver').length}
          sub={`${seasonParam} season`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* ---------------------------------------------------- FAAB budgets */}
        <section>
          <SectionTitle right={<span className="text-[11px] text-ink-5">remaining</span>}>
            Budgets
          </SectionTitle>
          <Card padded={false}>
            {budgets.map((t, i) => (
              <div
                key={t.rosterId}
                className={`px-3.5 py-2.5 ${i ? 'border-t border-line/60' : ''}`}
              >
                <div className="mb-1.5 flex items-center gap-2.5">
                  <Avatar src={t.avatar} name={t.name} size={24} />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-2">
                    {t.name}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-ink tnum">${t.remaining}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full rounded-full bg-teal transition-all"
                    style={{ width: `${Math.max(0, (1 - t.pctUsed) * 100)}%` }}
                  />
                </div>
                {t.waiverBudgetUsed > 0 && (
                  <div className="mt-1 text-[10px] text-ink-5 tnum">
                    ${t.waiverBudgetUsed} spent
                    {t.waiverPosition ? ` · waiver #${t.waiverPosition}` : ''}
                  </div>
                )}
              </div>
            ))}
          </Card>
        </section>

        {/* --------------------------------------------------------- the wire */}
        <section>
          <SectionTitle
            right={<span className="text-[11px] text-ink-5 tnum">{wire.length} available</span>}
          >
            Available players
          </SectionTitle>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Segmented
              size="sm"
              value={pos}
              onChange={setPos}
              options={[
                { value: 'ALL', label: 'All' },
                ...POSITION_ORDER.map((p) => ({ value: p, label: p })),
              ]}
            />
            <div className="w-full sm:ml-auto sm:w-52">
              <SearchInput value={query} onChange={setQuery} placeholder="Search players" />
            </div>
          </div>

          {wire.length === 0 ? (
            <EmptyState
              title="Nothing on the wire"
              detail="Every player Sleeper is trending on in the last 24 hours is already rostered in this league."
            />
          ) : (
            <Card padded={false}>
              {wire.map((t, i) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 px-3.5 py-2.5 ${
                    i ? 'border-t border-line/60' : ''
                  }`}
                >
                  <PositionBadge pos={t.player!.pos} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-2">
                      {t.player!.name}
                      {t.player!.injury && (
                        <span className="ml-2 text-[10px] font-bold text-rose">
                          {t.player!.injury}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px]">
                      <span className="text-ink-4">{t.player!.team ?? 'FA'}</span>
                      <span className="mx-1 text-ink-5">·</span>
                      <PlayerMeta player={t.player!} />
                    </div>
                  </div>
                  {points.projections[t.id] && (
                    <span className="shrink-0 text-right text-[11px] text-ink-4 tnum">
                      {pts1(points.projections[t.id]!.pts)}
                      <span className="block text-[9px] text-ink-5">proj</span>
                    </span>
                  )}
                  <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-teal tnum">
                    <TrendUpIcon className="size-3.5" />
                    {t.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </Card>
          )}
          <p className="mt-2 text-[11px] text-ink-5">
            Ranked by Sleeper adds across all leagues in the last 24 hours, filtered to players
            unrostered in yours. Sleeper exposes no per-league free-agent list, so this is the
            closest equivalent.
          </p>
        </section>
      </div>

      {/* ------------------------------------------------------ recent claims */}
      <section className="mt-6">
        <SectionTitle>Recent waiver claims</SectionTitle>
        {claims.length === 0 ? (
          <EmptyState title="No waiver claims this season yet" />
        ) : (
          <Card padded={false}>
            {claims.map((t, i) => {
              const adds = Object.entries(t.adds ?? {})
              return (
                <div
                  key={t.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 ${
                    i ? 'border-t border-line/60' : ''
                  }`}
                >
                  <span className="rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-bold text-amber tnum">
                    ${t.faab ?? 0}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {adds.map(([id, rosterId]) => (
                      <span key={id} className="flex items-center gap-1.5 text-xs">
                        <PositionBadge pos={players[id]?.pos ?? null} />
                        <span className="font-medium text-ink-2">
                          {players[id]?.name ?? id}
                        </span>
                        <span className="text-ink-5">
                          → {teamsByRoster.get(rosterId)?.name ?? `Roster ${rosterId}`}
                        </span>
                      </span>
                    ))}
                    {adds.length === 0 && (
                      <span className="text-xs text-ink-5">{t.teams.join(', ')}</span>
                    )}
                  </div>
                  <span className="text-[11px] text-ink-5">
                    wk {t.week} · {relativeTime(t.created)}
                  </span>
                </div>
              )
            })}
          </Card>
        )}
      </section>
    </>
  )
}
