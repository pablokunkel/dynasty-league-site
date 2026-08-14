import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useManifest, usePlayers, usePoints, useSeason } from '../lib/data'
import type { Player, PointsDoc, Team } from '../lib/types'
import { POSITION_ORDER, posRank, pts1, record, slotLabel } from '../lib/format'
import {
  Avatar,
  Card,
  PageHeader,
  PlayerMeta,
  PositionBadge,
  SectionTitle,
  Segmented,
  Select,
  Td,
  Th,
  TableWrap,
} from '../components/ui'

type SortKey = 'pos' | 'name' | 'actual' | 'projected'

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
                {r.player?.name ?? <span className="text-ink-5">Unknown ({r.id})</span>}
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

  const selected = teams.find((t) => String(t.rosterId) === view)

  const filterRows = (rows: Row[]) =>
    posFilter === 'ALL' ? rows : rows.filter((r) => r.player?.pos === posFilter)

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
                ...POSITION_ORDER.map((p) => ({ value: p, label: p })),
              ]}
            />
          </>
        }
      />

      <p className="mb-5 max-w-3xl text-[11px] leading-relaxed text-ink-5">
        Starting lineup is {season.rosterPositions.filter((p) => p !== 'BN').map(slotLabel).join(' · ')}.{' '}
        {points.note} Projections are season-long totals, so they do not change week to week.
      </p>

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
                    <Avatar src={t.avatar} name={t.name} size={20} />
                    <span className="text-ink-2">{t.name}</span>
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
