import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useManifest, usePlayers, useSeason, useTransactions } from '../lib/data'
import type { Player, Transaction } from '../lib/types'
import { POSITION_ORDER, relativeTime, dateTime, TRANSACTION_LABELS } from '../lib/format'
import {
  Avatar,
  Card,
  EmptyState,
  PageHeader,
  PositionBadge,
  SearchInput,
  Segmented,
  Select,
} from '../components/ui'

const TYPE_STYLE: Record<string, { dot: string; text: string }> = {
  trade: { dot: 'bg-indigo', text: 'text-indigo' },
  waiver: { dot: 'bg-amber', text: 'text-amber' },
  free_agent: { dot: 'bg-teal', text: 'text-teal' },
  commissioner: { dot: 'bg-ink-4', text: 'text-ink-4' },
}

function MoveList({
  ids,
  players,
  teamFor,
  kind,
}: {
  ids: Record<string, number> | null
  players: Record<string, Player>
  teamFor: (rosterId: number) => string
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
            <span className="truncate font-medium text-ink-2">
              {p?.name ?? `Unknown (${playerId})`}
            </span>
            <span className="truncate text-ink-5">
              {p?.team ? `${p.team} · ` : ''}
              {teamFor(rosterId)}
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
  const teamFor = (rosterId: number) => teamsByRoster.get(rosterId)?.name ?? `Roster ${rosterId}`

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
            ...POSITION_ORDER.map((p) => ({ value: p, label: p })),
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
                          <span key={id} className="flex items-center gap-1.5">
                            <Avatar src={tm?.avatar ?? null} name={tm?.name ?? '?'} size={20} />
                            <span className="text-xs font-semibold text-ink-3">
                              {tm?.name ?? `Roster ${id}`}
                            </span>
                          </span>
                        )
                      })}
                    </div>

                    <div className="space-y-1.5">
                      <MoveList ids={t.adds} players={players} teamFor={teamFor} kind="add" />
                      <MoveList ids={t.drops} players={players} teamFor={teamFor} kind="drop" />
                      {t.draftPicks.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-4 shrink-0 text-center font-bold text-indigo">→</span>
                          <span className="text-ink-2">
                            {p.season} round {p.round} pick
                          </span>
                          <span className="text-ink-5">
                            {teamFor(p.previous_owner_id)} → {teamFor(p.owner_id)}
                          </span>
                        </div>
                      ))}
                      {t.budgetMoves.map((b, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="w-4 shrink-0 text-center font-bold text-amber">$</span>
                          <span className="text-ink-2 tnum">${b.amount} FAAB</span>
                          <span className="text-ink-5">
                            {teamFor(b.sender)} → {teamFor(b.receiver)}
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
