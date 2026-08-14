import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useManifest, usePlayers, usePoints, useSeason } from '../lib/data'
import type { Player, PointsDoc, Team } from '../lib/types'
import { posRank, pts1, record, slotLabel } from '../lib/format'
import {
  Avatar,
  Card,
  PageHeader,
  PlayerLink,
  PlayerMeta,
  PositionBadge,
  SectionTitle,
  Segmented,
  Select,
  TeamLink,
  Td,
  Th,
  TableWrap,
} from '../components/ui'

type SortKey = 'pos' | 'name' | 'actual' | 'projected'
type Density = 'compact' | 'detailed'

interface Row {
  id: string
  player: Player | undefined
  actual: number | null
  projected: number | null
  slot: 'STARTER' | 'BENCH' | 'TAXI' | 'IR'
}

function buildRows(team: Team, players: Record<string, Player>, points: PointsDoc): Row[] {
  const starters = new Set(team.starters)
  const taxi = new Set(team.taxi)
  const reserve = new Set(team.reserve)

  return team.players.map((id) => ({
    id,
    player: players[id],
    actual: points.actuals[id]?.pts ?? null,
    projected: points.projections[id]?.pts ?? null,
    slot: taxi.has(id)
      ? 'TAXI'
      : reserve.has(id)
        ? 'IR'
        : starters.has(id)
          ? 'STARTER'
          : 'BENCH',
  }))
}

const SLOT_STYLE: Record<Row['slot'], string> = {
  STARTER: 'text-teal',
  BENCH: 'text-ink-5',
  TAXI: 'text-indigo',
  IR: 'text-rose',
}

/** Slot signal for the compact view, where there is no room for a text column. */
const SLOT_DOT: Record<Row['slot'], string> = {
  STARTER: 'bg-teal',
  BENCH: 'bg-ink-5/40',
  TAXI: 'bg-indigo',
  IR: 'bg-rose',
}

const SLOT_RANK: Record<Row['slot'], number> = { STARTER: 0, BENCH: 1, TAXI: 2, IR: 3 }

const SLOTS = ['STARTER', 'BENCH', 'TAXI', 'IR'] as const

/**
 * Compact cards group by position so the same blocks appear in the same order on
 * every card — that vertical consistency is what makes cross-team scanning work.
 * Within a block, starters float to the top, then by projection.
 */
function groupByPosition(rows: Row[]) {
  const map = new Map<string, Row[]>()
  for (const r of rows) {
    const pos = r.player?.pos ?? '—'
    const list = map.get(pos)
    if (list) list.push(r)
    else map.set(pos, [r])
  }
  return [...map.entries()]
    .sort((a, b) => posRank(a[0]) - posRank(b[0]) || a[0].localeCompare(b[0]))
    .map(([pos, list]) => ({
      pos,
      proj: list.reduce((a, r) => a + (r.projected ?? 0), 0),
      rows: [...list].sort(
        (a, b) =>
          SLOT_RANK[a.slot] - SLOT_RANK[b.slot] ||
          (b.projected ?? -1) - (a.projected ?? -1) ||
          (a.player?.name ?? '').localeCompare(b.player?.name ?? '')
      ),
    }))
}

function SlotDot({ slot }: { slot: Row['slot'] }) {
  return (
    <span
      title={slot}
      className={`size-1.5 shrink-0 rounded-full ${SLOT_DOT[slot]}`}
      aria-hidden="true"
    />
  )
}

function CompactTeamCard({
  team,
  rows,
  season,
}: {
  team: Team
  rows: Row[]
  season: string
}) {
  const groups = useMemo(() => groupByPosition(rows), [rows])
  const projTotal = rows.reduce((a, r) => a + (r.projected ?? 0), 0)

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-sunken/40 px-3 py-2">
        <TeamLink
          rosterId={team.rosterId}
          name={team.name}
          season={season}
          avatar={team.avatar}
          size={22}
          className="min-w-0 text-[13px] font-semibold text-ink-2"
        />
        <div className="shrink-0 text-right leading-tight">
          <div className="text-[13px] font-bold text-ink tnum">{pts1(projTotal)}</div>
          <div className="text-[10px] text-ink-5 tnum">
            {record(team.wins, team.losses, team.ties)}
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="px-3 py-5 text-center text-[11px] text-ink-5">
          No players match this filter.
        </div>
      ) : (
        <div className="divide-y divide-line/50">
          {groups.map((g) => (
            <div key={g.pos} className="px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 px-1 pb-1">
                <span className="flex items-center gap-1.5">
                  <PositionBadge pos={g.pos === '—' ? null : g.pos} />
                  <span className="text-[10px] font-semibold text-ink-5 tnum">
                    {g.rows.length}
                  </span>
                </span>
                <span className="text-[10px] text-ink-5 tnum">{pts1(g.proj)}</span>
              </div>
              <ul>
                {g.rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-1.5 rounded px-1 py-[3px] hover:bg-card-2/60"
                  >
                    <SlotDot slot={r.slot} />
                    <PlayerLink
                      id={r.id}
                      className={`min-w-0 flex-1 truncate text-[12px] ${
                        r.slot === 'STARTER' ? 'font-semibold text-ink-2' : 'text-ink-4'
                      }`}
                    >
                      {r.player?.name ?? `Unknown (${r.id})`}
                    </PlayerLink>
                    {r.player?.injury && (
                      <span className="shrink-0 text-[9px] font-bold text-rose">
                        {r.player.injury}
                      </span>
                    )}
                    <span
                      className={`shrink-0 text-[11px] tnum ${
                        r.slot === 'STARTER' ? 'font-semibold text-ink-2' : 'text-ink-5'
                      }`}
                    >
                      {r.projected != null ? pts1(r.projected) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function SlotLegend() {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.4px] text-ink-5">
      {SLOTS.map((s) => (
        <span key={s} className="flex items-center gap-1.5">
          <SlotDot slot={s} />
          {s}
        </span>
      ))}
    </div>
  )
}

function RosterTable({
  rows,
  sort,
  dir,
  onSort,
  points,
  grouped,
}: {
  rows: Row[]
  sort: SortKey
  dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  points: PointsDoc
  grouped: boolean
}) {
  const sorted = useMemo(() => {
    const f = dir === 'asc' ? 1 : -1
    const copy = [...rows]
    copy.sort((a, b) => {
      switch (sort) {
        case 'name':
          return (a.player?.name ?? '').localeCompare(b.player?.name ?? '') * f
        case 'actual':
          return ((a.actual ?? -1) - (b.actual ?? -1)) * f
        case 'projected':
          return ((a.projected ?? -1) - (b.projected ?? -1)) * f
        default:
          return (
            (posRank(a.player?.pos ?? null) - posRank(b.player?.pos ?? null) ||
              (b.projected ?? 0) - (a.projected ?? 0)) * f
          )
      }
    })
    return copy
  }, [rows, sort, dir])

  // When grouping is on and we're sorting by position, insert a header row per
  // position block the way Sleeper's roster view does.
  const withHeaders: (Row | { header: string; count: number })[] = useMemo(() => {
    if (!grouped || sort !== 'pos') return sorted
    const out: (Row | { header: string; count: number })[] = []
    let current: string | null = null
    for (const r of sorted) {
      const pos = r.player?.pos ?? '—'
      if (pos !== current) {
        current = pos
        out.push({
          header: pos,
          count: sorted.filter((x) => (x.player?.pos ?? '—') === pos).length,
        })
      }
      out.push(r)
    }
    return out
  }, [sorted, grouped, sort])

  return (
    <TableWrap>
      <thead>
        <tr>
          <Th className="w-16">Slot</Th>
          <Th sortable active={sort === 'pos'} dir={dir} onClick={() => onSort('pos')} className="w-16">
            Pos
          </Th>
          <Th sortable active={sort === 'name'} dir={dir} onClick={() => onSort('name')}>
            Player
          </Th>
          <Th className="w-52">Detail</Th>
          <Th
            sortable
            active={sort === 'actual'}
            dir={dir}
            onClick={() => onSort('actual')}
            align="right"
            className="w-24"
          >
            {points.actualsSeason ?? 'Prior'} pts
          </Th>
          <Th
            sortable
            active={sort === 'projected'}
            dir={dir}
            onClick={() => onSort('projected')}
            align="right"
            className="w-24"
          >
            {points.projectionsSeason} proj
          </Th>
        </tr>
      </thead>
      <tbody>
        {withHeaders.map((r, i) =>
          'header' in r ? (
            <tr key={`h-${r.header}`} className="bg-sunken/60">
              <td colSpan={6} className="px-3 py-1.5">
                <span className="eyebrow">
                  {r.header} <span className="text-ink-5">({r.count})</span>
                </span>
              </td>
            </tr>
          ) : (
            <tr
              key={r.id}
              className={`border-t border-line/60 hover:bg-card-2/60 ${i % 2 ? 'bg-sunken/20' : ''}`}
            >
              <Td>
                <span className={`text-[10px] font-bold ${SLOT_STYLE[r.slot]}`}>{r.slot}</span>
              </Td>
              <Td>
                <PositionBadge pos={r.player?.pos ?? null} />
              </Td>
              <Td className="font-medium text-ink-2">
                <PlayerLink id={r.id}>
                  {r.player?.name ?? <span className="text-ink-5">Unknown ({r.id})</span>}
                </PlayerLink>
                {r.player?.injury && (
                  <span className="ml-2 text-[10px] font-bold text-rose">{r.player.injury}</span>
                )}
              </Td>
              <Td className="text-xs">
                {r.player ? <PlayerMeta player={r.player} /> : null}
              </Td>
              <Td align="right" className="text-ink-3 tnum">
                {r.actual != null ? pts1(r.actual) : <span className="text-ink-5">—</span>}
              </Td>
              <Td align="right" className="font-semibold text-ink-2 tnum">
                {r.projected != null ? pts1(r.projected) : <span className="text-ink-5">—</span>}
              </Td>
            </tr>
          )
        )}
      </tbody>
    </TableWrap>
  )
}

export default function Teams() {
  const manifest = useManifest()
  const [params, setParams] = useSearchParams()
  const seasonParam = params.get('season') ?? manifest.currentSeason
  const season = useSeason(seasonParam)
  const players = usePlayers()
  const points = usePoints()

  const [sort, setSort] = useState<SortKey>('pos')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')
  const [posFilter, setPosFilter] = useState('ALL')
  const [density, setDensity] = useState<Density>('compact')

  const teamParam = params.get('team')
  const view = teamParam ?? 'ALL'

  const onSort = (k: SortKey) => {
    if (sort === k) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(k)
      // Points columns are most useful highest-first; text ascending.
      setDir(k === 'actual' || k === 'projected' ? 'desc' : 'asc')
    }
  }

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null || value === 'ALL') next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }

  const teams = useMemo(
    () =>
      season.teams
        .filter((t) => !manifest.hiddenUserIds.includes(t.ownerId ?? ''))
        .sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor),
    [season.teams, manifest.hiddenUserIds]
  )

  // The league rosters no K and no DEF — offering them would be a bug, so the
  // filter is derived from the manifest rather than the sort-order constant.
  const positionOptions = useMemo(
    () => [...manifest.activePositions].sort((a, b) => posRank(a) - posRank(b)),
    [manifest.activePositions]
  )

  const selected = teams.find((t) => String(t.rosterId) === view)

  const filterRows = (rows: Row[]) =>
    posFilter === 'ALL' ? rows : rows.filter((r) => r.player?.pos === posFilter)

  const compact = !selected && density === 'compact'

  return (
    <>
      <PageHeader
        title="Teams"
        subtitle={`${seasonParam} · ${teams.length} rosters`}
        right={
          <>
            <Select
              label="Season"
              value={seasonParam}
              onChange={(v) => setParam('season', v)}
              options={manifest.seasons.map((s) => ({ value: s.season, label: s.season }))}
            />
            <Select
              label="Team"
              value={view}
              onChange={(v) => setParam('team', v)}
              options={[
                { value: 'ALL', label: 'All teams' },
                ...teams.map((t) => ({ value: String(t.rosterId), label: t.name })),
              ]}
            />
            <Segmented
              size="sm"
              value={posFilter}
              onChange={setPosFilter}
              options={[
                { value: 'ALL', label: 'All' },
                ...positionOptions.map((p) => ({ value: p, label: p })),
              ]}
            />
            {!selected && (
              <Segmented<Density>
                size="sm"
                value={density}
                onChange={setDensity}
                options={[
                  { value: 'compact', label: 'Compact' },
                  { value: 'detailed', label: 'Detailed' },
                ]}
              />
            )}
          </>
        }
      />

      <p className="mb-3 max-w-3xl text-[11px] leading-relaxed text-ink-5">
        Starting lineup is {season.rosterPositions.filter((p) => p !== 'BN').map(slotLabel).join(' · ')}.{' '}
        {points.note} Projections are season-long totals, so they do not change week to week.
        {compact && ' Compact cards show projected points; switch to Detailed for actuals and player bios.'}
      </p>

      {compact && <SlotLegend />}

      {selected ? (
        <>
          <Card className="mb-4 flex flex-wrap items-center gap-4">
            <Avatar src={selected.avatar} name={selected.name} size={48} />
            <div className="flex-1">
              <div className="text-lg font-bold text-ink">{selected.name}</div>
              <div className="text-xs text-ink-4">
                {selected.handle ? `@${selected.handle} · ` : ''}
                {record(selected.wins, selected.losses, selected.ties)} ·{' '}
                {pts1(selected.pointsFor)} PF · {pts1(selected.pointsAgainst)} PA
                {selected.finalPlace ? ` · finished ${selected.finalPlace}` : ''}
              </div>
            </div>
            <div className="flex gap-5 text-right">
              <div>
                <div className="eyebrow">Players</div>
                <div className="text-base font-bold text-ink tnum">{selected.players.length}</div>
              </div>
              <div>
                <div className="eyebrow">Taxi</div>
                <div className="text-base font-bold text-indigo tnum">{selected.taxi.length}</div>
              </div>
              <div>
                <div className="eyebrow">FAAB used</div>
                <div className="text-base font-bold text-amber tnum">
                  ${selected.waiverBudgetUsed}
                </div>
              </div>
            </div>
          </Card>

          <RosterTable
            rows={filterRows(buildRows(selected, players, points))}
            sort={sort}
            dir={dir}
            onSort={onSort}
            points={points}
            grouped
          />
        </>
      ) : density === 'compact' ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {teams.map((t) => (
            <CompactTeamCard
              key={t.rosterId}
              team={t}
              rows={filterRows(buildRows(t, players, points))}
              season={seasonParam}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {teams.map((t) => {
            const rows = filterRows(buildRows(t, players, points))
            const projTotal = rows.reduce((a, r) => a + (r.projected ?? 0), 0)
            return (
              <section key={t.rosterId}>
                <SectionTitle
                  right={
                    <span className="text-[11px] text-ink-5 tnum">
                      {rows.length} players · {pts1(projTotal)} proj
                    </span>
                  }
                >
                  <span className="flex items-center gap-2">
                    <TeamLink
                      rosterId={t.rosterId}
                      name={t.name}
                      season={seasonParam}
                      avatar={t.avatar}
                      size={20}
                      className="text-ink-2"
                    />
                    <span className="font-normal normal-case tracking-normal text-ink-5">
                      {record(t.wins, t.losses, t.ties)}
                    </span>
                  </span>
                </SectionTitle>
                <RosterTable
                  rows={rows}
                  sort={sort}
                  dir={dir}
                  onSort={onSort}
                  points={points}
                  grouped={false}
                />
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
