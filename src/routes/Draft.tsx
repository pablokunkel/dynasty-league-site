import { useEffect, useMemo, useState } from 'react'
import { useManifest, usePlayers, useProspects, useSeason } from '../lib/data'
import type { DraftPick, Player } from '../lib/types'
import { height, pts1 } from '../lib/format'
import {
  Avatar,
  Card,
  EmptyState,
  PageHeader,
  PlayerLink,
  PositionBadge,
  SearchInput,
  SectionTitle,
  Segmented,
  Td,
  Th,
  TableWrap,
} from '../components/ui'
import { ClockIcon, MoheganSunIcon, PinIcon } from '../components/icons'

/* --------------------------------------------------------------- countdown */

function useCountdown(iso: string) {
  const target = useMemo(() => new Date(iso).getTime(), [iso])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const diff = target - now
  if (Number.isNaN(target)) return null
  const past = diff <= 0
  const abs = Math.abs(diff)
  return {
    past,
    days: Math.floor(abs / 86_400_000),
    hours: Math.floor((abs % 86_400_000) / 3_600_000),
    minutes: Math.floor((abs % 3_600_000) / 60_000),
    seconds: Math.floor((abs % 60_000) / 1000),
  }
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-[62px] flex-col items-center rounded-xl bg-sunken px-2 py-3">
      <div className="text-3xl font-extrabold leading-none text-ink tnum">
        {String(value).padStart(2, '0')}
      </div>
      <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-ink-5">
        {label}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- draft board */

function PickCell({ pick, players }: { pick: DraftPick; players: Record<string, Player> }) {
  const player = pick.playerId ? players[pick.playerId] : null

  return (
    <div
      className={`flex h-[74px] flex-col justify-between rounded-lg border p-2 ${
        pick.wasTraded ? 'border-amber/35 bg-amber/[0.06]' : 'border-line bg-sunken'
      }`}
    >
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] font-bold text-ink-5 tnum">{pick.label}</span>
        {pick.wasTraded && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-amber">
            traded
          </span>
        )}
      </div>

      {player ? (
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <PositionBadge pos={player.pos} />
            <PlayerLink id={pick.playerId} className="truncate text-[11px] font-semibold text-ink">
              {player.name}
            </PlayerLink>
          </div>
        </div>
      ) : (
        <div className="truncate text-[11px] font-semibold leading-tight text-ink-2">
          {pick.currentTeam ?? '—'}
        </div>
      )}

      {pick.wasTraded ? (
        <div className="truncate text-[9px] leading-tight text-ink-5">
          via {pick.originalTeam}
        </div>
      ) : (
        <div className="text-[9px] text-ink-5">&nbsp;</div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- prospects */

type SortKey = 'rank' | 'name' | 'pos' | 'age'

function ProspectBoard({
  prospects,
  activePositions,
}: {
  prospects: Player[]
  activePositions: string[]
}) {
  const [pos, setPos] = useState<string>('ALL')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('rank')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')

  // The league rosters no kickers or defenses, so those prospects are noise —
  // drop them before anything else counts, filters, or sorts.
  const eligible = useMemo(
    () => prospects.filter((p) => p.pos != null && activePositions.includes(p.pos)),
    [prospects, activePositions]
  )

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = eligible.filter((p) => {
      if (pos !== 'ALL' && p.pos !== pos) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.college ?? '').toLowerCase().includes(q) ||
        (p.team ?? '').toLowerCase().includes(q)
      )
    })

    const factor = dir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name) * factor
        case 'pos':
          return ((a.pos ?? '').localeCompare(b.pos ?? '') || a.name.localeCompare(b.name)) * factor
        case 'age':
          return ((a.age ?? 99) - (b.age ?? 99)) * factor
        default:
          // Unranked players always sort last regardless of direction — an
          // absent rank is "unknown", not "best".
          return (
            ((a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)) * factor
          )
      }
    })
  }, [eligible, pos, query, sort, dir])

  const toggle = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(key)
      setDir(key === 'name' || key === 'pos' ? 'asc' : 'asc')
    }
  }

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of eligible) m.set(p.pos ?? '?', (m.get(p.pos ?? '?') ?? 0) + 1)
    return m
  }, [eligible])

  return (
    <>
      <SectionTitle
        right={
          <span className="text-[11px] text-ink-5 tnum">
            {rows.length} of {eligible.length}
          </span>
        }
      >
        Prospect board
      </SectionTitle>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={pos}
          onChange={setPos}
          options={[
            { value: 'ALL', label: 'All' },
            ...activePositions
              .filter((p) => counts.has(p))
              .map((p) => ({ value: p, label: `${p} ${counts.get(p)}` })),
          ]}
        />
        <div className="w-full sm:ml-auto sm:w-64">
          <SearchInput value={query} onChange={setQuery} placeholder="Player, college, team" />
        </div>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <Th sortable active={sort === 'rank'} dir={dir} onClick={() => toggle('rank')} align="right" className="w-16">
              Rank
            </Th>
            <Th sortable active={sort === 'name'} dir={dir} onClick={() => toggle('name')}>
              Player
            </Th>
            <Th sortable active={sort === 'pos'} dir={dir} onClick={() => toggle('pos')} className="w-20">
              Pos
            </Th>
            <Th className="w-20">NFL</Th>
            <Th className="w-16" align="center">Depth</Th>
            <Th sortable active={sort === 'age'} dir={dir} onClick={() => toggle('age')} align="right" className="w-16">
              Age
            </Th>
            <Th className="w-28" align="right">Size</Th>
            <Th>College</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr
              key={p.id}
              className={`border-t border-line/60 hover:bg-card-2/60 ${i % 2 ? 'bg-sunken/25' : ''}`}
            >
              <Td align="right" className="text-ink-5 tnum">
                {p.rank ?? '—'}
              </Td>
              <Td className="font-medium text-ink-2">
                <PlayerLink id={p.id}>{p.name}</PlayerLink>
              </Td>
              <Td>
                <PositionBadge pos={p.pos} />
              </Td>
              <Td className="text-ink-3">{p.team ?? <span className="text-ink-5">FA</span>}</Td>
              <Td align="center" className="text-ink-4 tnum">
                {p.depth ?? '—'}
              </Td>
              <Td align="right" className="text-ink-4 tnum">
                {p.age ?? '—'}
              </Td>
              <Td align="right" className="text-ink-4 tnum">
                {height(p.ht) ?? '—'}
                {p.wt ? `, ${p.wt}` : ''}
              </Td>
              <Td className="text-ink-4">{p.college ?? '—'}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      {rows.length === 0 && (
        <div className="mt-3">
          <EmptyState title="No prospects match" detail="Try clearing the search or position filter." />
        </div>
      )}
    </>
  )
}

/* -------------------------------------------------------------------- page */

export default function Draft() {
  const manifest = useManifest()
  const season = useSeason(manifest.currentSeason)
  const prospects = useProspects()
  const players = usePlayers()

  const cfg = manifest.draftConfig
  const countdown = useCountdown(cfg.startTime)
  const draft = season.draft

  const teamsByRoster = useMemo(
    () => new Map(season.teams.map((t) => [t.rosterId, t])),
    [season.teams]
  )

  // Pick counts per team, so you can see who loaded up on capital.
  const capital = useMemo(() => {
    if (!draft) return []
    const m = new Map<number, number>()
    for (const round of draft.board)
      for (const p of round.picks) m.set(p.currentRosterId, (m.get(p.currentRosterId) ?? 0) + 1)
    return [...m.entries()]
      .map(([rosterId, count]) => ({ team: teamsByRoster.get(rosterId), count }))
      .filter((x) => x.team)
      .sort((a, b) => b.count - a.count || a.team!.name.localeCompare(b.team!.name))
  }, [draft, teamsByRoster])

  const mapsHref = cfg.venue.mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cfg.venue.mapsQuery)}`
    : null

  return (
    <>
      <PageHeader
        title={`${manifest.currentSeason} Rookie Draft`}
        subtitle={
          <>
            {cfg.rounds} rounds · {draft?.teamCount ?? season.totalRosters} teams ·{' '}
            <span className="text-amber">{cfg.typeNote}</span>
          </>
        }
      />

      {!cfg.confirmed && (
        <div className="mb-5 rounded-xl border border-amber/40 bg-amber/[0.08] px-4 py-3 text-sm text-amber">
          <strong className="font-semibold">Draft time and venue are placeholders.</strong>{' '}
          Sleeper's API returns <code className="rounded bg-sunken px-1 text-xs">start_time: null</code> and
          has no location field, so these come from{' '}
          <code className="rounded bg-sunken px-1 text-xs">league.config.json</code>. Update it and
          set <code className="rounded bg-sunken px-1 text-xs">confirmed: true</code> to hide this
          notice.
        </div>
      )}

      {/* ------------------------------------------------ countdown + venue */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center gap-2">
            <ClockIcon className="size-4 text-teal" />
            <span className="eyebrow">
              {countdown?.past ? 'Draft started' : 'Time until first pick'}
            </span>
          </div>

          {countdown ? (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                <CountdownUnit value={countdown.days} label="days" />
                <CountdownUnit value={countdown.hours} label="hrs" />
                <CountdownUnit value={countdown.minutes} label="min" />
                <CountdownUnit value={countdown.seconds} label="sec" />
              </div>
              <div className="mt-3 text-xs text-ink-4">
                {new Date(cfg.startTime).toLocaleString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}{' '}
                <span className="text-ink-5">
                  ({cfg.timezoneLabel}) · shown in your local time
                </span>
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-rose">
              Invalid startTime in league.config.json.
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-2">
            <PinIcon className="size-4 text-teal" />
            <span className="eyebrow">Location</span>
          </div>
          <div className="mt-3 flex items-start gap-3">
            <MoheganSunIcon className="mt-0.5 w-12 shrink-0 text-teal" />
            <div className="min-w-0">
              <div className="text-base font-bold leading-tight text-ink">{cfg.venue.name}</div>
              {cfg.venue.addressLine && (
                <div className="mt-0.5 text-sm text-ink-3">{cfg.venue.addressLine}</div>
              )}
              {(cfg.venue.city || cfg.venue.region) && (
                <div className="text-sm text-ink-4">
                  {[cfg.venue.city, cfg.venue.region].filter(Boolean).join(', ')}
                </div>
              )}
            </div>
          </div>
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block rounded-lg border border-line bg-card-2 px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-teal hover:text-teal"
            >
              Open in Maps
            </a>
          )}

        </Card>
      </div>

      {/* ----------------------------------------------------- draft capital */}
      {capital.length > 0 && (
        <div className="mb-6">
          <SectionTitle right={<span className="text-[11px] text-ink-5">after trades</span>}>
            Draft capital
          </SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {capital.map(({ team, count }) => (
              <div key={team!.rosterId} className="card flex items-center gap-2.5 p-2.5">
                <Avatar src={team!.avatar} name={team!.name} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-ink-2">
                    {team!.name}
                  </div>
                  <div className="text-[10px] text-ink-5 tnum">
                    {count} pick{count === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- draft board */}
      {draft ? (
        <div className="mb-8">
          <SectionTitle
            right={
              <span className="flex items-center gap-3 text-[11px] text-ink-5">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-sm border border-amber/50 bg-amber/20" />
                  traded pick
                </span>
                <span>{draft.madePickCount} of {draft.rounds * draft.teamCount} made</span>
              </span>
            }
          >
            Draft board
          </SectionTitle>

          <div className="card overflow-x-auto p-3">
            <div className="min-w-max">
              {/* Column headers = draft slots in round-1 order */}
              <div
                className="mb-2 grid gap-2"
                style={{ gridTemplateColumns: `repeat(${draft.teamCount}, minmax(118px, 1fr))` }}
              >
                {draft.board[0]?.picks.map((p) => {
                  const original = teamsByRoster.get(p.originalRosterId)
                  return (
                    <div key={p.slot} className="px-0.5">
                      <div className="flex items-center gap-1.5">
                        <Avatar
                          src={original?.avatar ?? null}
                          name={original?.name ?? '?'}
                          size={20}
                        />
                        <span className="truncate text-[10px] font-semibold text-ink-4">
                          {original?.name ?? `Slot ${p.slot}`}
                        </span>
                      </div>
                      {p.priorMaxPoints != null && (
                        <div className="mt-0.5 pl-[26px] text-[9px] text-ink-5 tnum">
                          {pts1(p.priorMaxPoints)} max PF
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {draft.board.map((round) => (
                <div
                  key={round.round}
                  className="mb-2 grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${draft.teamCount}, minmax(118px, 1fr))` }}
                >
                  {round.picks.map((p) => (
                    <PickCell key={`${p.round}-${p.slot}`} pick={p} players={players} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-5">
            Columns are the original slot owner; each cell shows who actually picks there now.
            {draft.board[0]?.picks.some((p) => p.priorMaxPoints != null) && (
              <>
                {' '}
                Order is set by ascending prior-season Max Points For, per the{' '}
                <a href="/bylaws" className="text-teal hover:underline">
                  bylaws
                </a>
                .
              </>
            )}
          </p>
        </div>
      ) : (
        <EmptyState title="No draft found for this season" />
      )}

      {/* --------------------------------------------------------- prospects */}
      <ProspectBoard prospects={prospects.players} activePositions={manifest.activePositions} />
      <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-ink-5">{prospects.note}</p>
    </>
  )
}
