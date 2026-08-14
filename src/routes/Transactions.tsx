import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useManifest, usePlayers, useSeason, useTransactions } from '../lib/data'
import type { Player, Team, Transaction } from '../lib/types'
import { relativeTime, dateTime, TRANSACTION_LABELS } from '../lib/format'
import {
  Card,
  EmptyState,
  PageHeader,
  PlayerLink,
  PositionBadge,
  SearchInput,
  Segmented,
  Select,
  TeamLink,
} from '../components/ui'

const TYPE_STYLE: Record<string, { dot: string; text: string }> = {
  trade: { dot: 'bg-indigo', text: 'text-indigo' },
  waiver: { dot: 'bg-amber', text: 'text-amber' },
  free_agent: { dot: 'bg-teal', text: 'text-teal' },
  commissioner: { dot: 'bg-ink-4', text: 'text-ink-4' },
}

/** A roster reference rendered as a link to that team's page. */
function TeamRef({
  rosterId,
  teams,
  season,
  className = '',
}: {
  rosterId: number
  teams: Map<number, Team>
  season: string
  className?: string
}) {
  return (
    <TeamLink
      rosterId={rosterId}
      name={teams.get(rosterId)?.name ?? `Roster ${rosterId}`}
      season={season}
      showAvatar={false}
      className={className}
    />
  )
}

function MoveList({
  ids,
  players,
  teams,
  season,
  kind,
}: {
  ids: Record<string, number> | null
  players: Record<string, Player>
  teams: Map<number, Team>
  season: string
  kind: 'add' | 'drop'
}) {
  if (!ids || Object.keys(ids).length === 0) return null
  const isAdd = kind === 'add'
  return (
    <div className="space-y-1">
      {Object.entries(ids).map(([playerId, rosterId]) => {
        const p = players[playerId]
        return (
          <div key={`${kind}-${playerId}`} className="flex items-center gap-2 text-xs">
            <span
              className={`w-4 shrink-0 text-center font-bold ${isAdd ? 'text-teal' : 'text-rose'}`}
            >
              {isAdd ? '+' : '−'}
            </span>
            <PositionBadge pos={p?.pos ?? null} />
            <PlayerLink id={p ? playerId : null} className="truncate font-medium text-ink-2">
              {p?.name ?? `Unknown (${playerId})`}
            </PlayerLink>
            <span className="flex min-w-0 items-center gap-1 text-ink-5">
              {p?.team && <span className="shrink-0">{p.team} ·</span>}
              <TeamRef rosterId={rosterId} teams={teams} season={season} className="truncate" />
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default function Transactions() {
  const manifest = useManifest()
  const [params, setParams] = useSearchParams()
  const seasonParam = params.get('season') ?? manifest.currentSeason

  const season = useSeason(seasonParam)
  const transactions = useTransactions(seasonParam)
  const players = usePlayers()

  const [type, setType] = useState('ALL')
  const [team, setTeam] = useState('ALL')
  const [pos, setPos] = useState('ALL')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(60)

  const teamsByRoster = useMemo(
    () => new Map(season.teams.map((t) => [t.rosterId, t])),
    [season.teams]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()

    const matchesPlayer = (t: Transaction, test: (p: Player | undefined, id: string) => boolean) => {
      const ids = [...Object.keys(t.adds ?? {}), ...Object.keys(t.drops ?? {})]
      return ids.some((id) => test(players[id], id))
    }

    return transactions.filter((t) => {
      if (type !== 'ALL' && t.type !== type) return false
      if (team !== 'ALL' && !t.rosterIds.includes(Number(team))) return false
      if (pos !== 'ALL' && !matchesPlayer(t, (p) => p?.pos === pos)) return false
      if (q) {
        const inPlayers = matchesPlayer(t, (p) => (p?.name ?? '').toLowerCase().includes(q))
        const inTeams = t.teams.some((n) => n.toLowerCase().includes(q))
        if (!inPlayers && !inTeams) return false
      }
      return true
    })
  }, [transactions, type, team, pos, query, players])

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of transactions) m.set(t.type, (m.get(t.type) ?? 0) + 1)
    return m
  }, [transactions])

  const setSeason = (v: string) => {
    const next = new URLSearchParams(params)
    next.set('season', v)
    setParams(next, { replace: true })
    setTeam('ALL')
    setLimit(60)
  }

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={`${seasonParam} · ${transactions.length} total, newest first`}
        right={
          <Select
            label="Season"
            value={seasonParam}
            onChange={setSeason}
            options={manifest.seasons.map((s) => ({
              value: s.season,
              label: `${s.season} (${s.transactionCount})`,
            }))}
          />
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={type}
          onChange={setType}
          options={[
            { value: 'ALL', label: `All ${transactions.length}` },
            ...[...counts.entries()].map(([k, n]) => ({
              value: k,
              label: `${TRANSACTION_LABELS[k] ?? k} ${n}`,
            })),
          ]}
        />
        <Select
          label="Team"
          value={team}
          onChange={setTeam}
          options={[
            { value: 'ALL', label: 'All teams' },
            ...season.teams.map((t) => ({ value: String(t.rosterId), label: t.name })),
          ]}
        />
        <Segmented
          size="sm"
          value={pos}
          onChange={setPos}
          options={[
            { value: 'ALL', label: 'Any pos' },
            ...manifest.activePositions.map((p) => ({ value: p, label: p })),
          ]}
        />
        <div className="w-full sm:ml-auto sm:w-64">
          <SearchInput value={query} onChange={setQuery} placeholder="Player or team" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No transactions match" detail="Loosen a filter or clear the search." />
      ) : (
        <>
          <div className="space-y-2">
            {filtered.slice(0, limit).map((t) => {
              const style = TYPE_STYLE[t.type] ?? TYPE_STYLE.commissioner!
              return (
                <Card key={t.id} padded={false} className="overflow-hidden">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line/60 bg-sunken/40 px-3.5 py-2">
                    <span className={`inline-block size-1.5 rounded-full ${style.dot}`} />
                    <span className={`text-[11px] font-bold uppercase tracking-wide ${style.text}`}>
                      {TRANSACTION_LABELS[t.type] ?? t.type}
                    </span>
                    <span className="text-[11px] text-ink-5">week {t.week}</span>
                    {t.faab != null && (
                      <span className="rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-bold text-amber tnum">
                        ${t.faab}
                      </span>
                    )}
                    {t.status !== 'complete' && (
                      <span className="rounded bg-rose/15 px-1.5 py-0.5 text-[10px] font-bold text-rose">
                        {t.status}
                      </span>
                    )}
                    <span
                      className="ml-auto text-[11px] text-ink-5"
                      title={dateTime(t.created)}
                    >
                      {relativeTime(t.created)}
                    </span>
                  </div>

                  <div className="grid gap-3 px-3.5 py-3 sm:grid-cols-[180px_1fr]">
                    <div className="flex flex-wrap items-center gap-2">
                      {t.rosterIds.map((id) => {
                        const tm = teamsByRoster.get(id)
                        return (
                          <TeamLink
                            key={id}
                            rosterId={id}
                            name={tm?.name ?? `Roster ${id}`}
                            season={seasonParam}
                            avatar={tm?.avatar ?? null}
                            size={20}
                            className="gap-1.5 text-xs font-semibold text-ink-3"
                          />
                        )
                      })}
                    </div>

                    <div className="space-y-1.5">
                      <MoveList
                        ids={t.adds}
                        players={players}
                        teams={teamsByRoster}
                        season={seasonParam}
                        kind="add"
                      />
                      <MoveList
                        ids={t.drops}
                        players={players}
                        teams={teamsByRoster}
                        season={seasonParam}
                        kind="drop"
                      />
                      {t.draftPicks.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-4 shrink-0 text-center font-bold text-indigo">→</span>
                          <span className="text-ink-2">
                            {p.season} round {p.round} pick
                          </span>
                          <span className="flex min-w-0 items-center gap-1 text-ink-5">
                            <TeamRef
                              rosterId={p.previous_owner_id}
                              teams={teamsByRoster}
                              season={seasonParam}
                              className="truncate"
                            />
                            <span className="shrink-0">→</span>
                            <TeamRef
                              rosterId={p.owner_id}
                              teams={teamsByRoster}
                              season={seasonParam}
                              className="truncate"
                            />
                          </span>
                        </div>
                      ))}
                      {t.budgetMoves.map((b, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-4 shrink-0 text-center font-bold text-amber">$</span>
                          <span className="text-ink-2 tnum">${b.amount} FAAB</span>
                          <span className="flex min-w-0 items-center gap-1 text-ink-5">
                            <TeamRef
                              rosterId={b.sender}
                              teams={teamsByRoster}
                              season={seasonParam}
                              className="truncate"
                            />
                            <span className="shrink-0">→</span>
                            <TeamRef
                              rosterId={b.receiver}
                              teams={teamsByRoster}
                              season={seasonParam}
                              className="truncate"
                            />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>

          {limit < filtered.length && (
            <button
              onClick={() => setLimit((n) => n + 100)}
              className="mt-4 w-full rounded-xl border border-line bg-card py-3 text-xs font-semibold text-ink-3 hover:border-teal hover:text-teal"
            >
              Show more ({filtered.length - limit} remaining)
            </button>
          )}
        </>
      )}
    </>
  )
}
