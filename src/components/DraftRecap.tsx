import { useMemo, useState } from 'react'
import type {
  Draft,
  DraftPick,
  Player,
  PlayerIndex,
  PointsEntry,
  ProspectsDoc,
  Team,
} from '../lib/types'
import { height, ordinal, pts1 } from '../lib/format'
import {
  Card,
  EmptyState,
  PlayerLink,
  PositionBadge,
  SearchInput,
  SectionTitle,
  Segmented,
  StatTile,
  TeamLink,
  Td,
  Th,
  TableWrap,
} from './ui'

/**
 * Post-draft replacement for the prospect board.
 *
 * Grades every pick against where the player sat on Sleeper's board the
 * moment before the draft (the frozen snapshot in content/predraft-ranks),
 * shows what each pick projects to this season, and lists who went undrafted.
 *
 * "Board" is the player's position among the rookie class, not Sleeper's raw
 * search_rank — a raw rank of 61 means nothing next to a pick number, but
 * "3rd on the board, taken 1.08" does. Delta is board minus overall: positive
 * means the room let him fall, negative means someone jumped the board.
 */

interface GradedPick {
  pick: DraftPick
  playerId: string
  player: Player
  board: number | null
  delta: number | null
  proj: number | null
  team: Team | undefined
}

type SortKey = 'pick' | 'board' | 'delta' | 'proj' | 'name' | 'age'

function Delta({ value }: { value: number | null }) {
  if (value == null) return <span className="text-ink-5">—</span>
  if (value === 0) return <span className="text-ink-5">0</span>
  return (
    <span
      className="font-semibold"
      style={{ color: value > 0 ? 'var(--color-teal)' : 'var(--color-rose)' }}
    >
      {value > 0 ? '+' : '−'}
      {Math.abs(value)}
    </span>
  )
}

/** Player name + position badge for a tile, sized to survive a long name. */
function PickTileValue({ entry }: { entry: GradedPick | undefined }) {
  if (!entry) return <>—</>
  return (
    <span className="flex min-w-0 items-center gap-2">
      <PositionBadge pos={entry.player.pos} />
      <PlayerLink id={entry.playerId} className="min-w-0 truncate text-base">
        {entry.player.name}
      </PlayerLink>
    </span>
  )
}

export default function DraftRecap({
  draft,
  board,
  players,
  prospects,
  projections,
  teams,
  activePositions,
}: {
  draft: Draft
  /** The board with any live picks merged in — same shape as `draft.board`. */
  board: Draft['board']
  players: PlayerIndex
  prospects: ProspectsDoc
  projections: Record<string, PointsEntry>
  teams: Team[]
  activePositions: string[]
}) {
  const [pos, setPos] = useState<string>('ALL')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('pick')
  const [dir, setDir] = useState<'asc' | 'desc'>('asc')

  const teamsByRoster = useMemo(() => new Map(teams.map((t) => [t.rosterId, t])), [teams])

  /** playerId -> the fantasy team rostering them today. */
  const ownerOf = useMemo(() => {
    const m = new Map<string, Team>()
    for (const t of teams) for (const id of t.players) m.set(id, t)
    return m
  }, [teams])

  const graded = prospects.preDraftRanks != null

  /**
   * Board position within the rookie class. Pre-draft ranks when we have the
   * snapshot; otherwise today's ranks, which still sort the class sensibly
   * but say nothing about reaches and steals — `graded` gates those.
   */
  const boardPos = useMemo(() => {
    const rankOf = (p: Player) =>
      graded ? (prospects.preDraftRanks![p.id] ?? null) : p.rank
    const ranked = prospects.players
      .filter((p) => p.pos != null && activePositions.includes(p.pos) && rankOf(p) != null)
      .sort((a, b) => rankOf(a)! - rankOf(b)!)
    return new Map(ranked.map((p, i) => [p.id, i + 1]))
  }, [prospects, activePositions, graded])

  const picks = useMemo<GradedPick[]>(() => {
    const out: GradedPick[] = []
    for (const round of board) {
      for (const pick of round.picks) {
        if (!pick.playerId) continue
        const player = players[pick.playerId]
        if (!player) continue
        const bp = boardPos.get(pick.playerId) ?? null
        out.push({
          pick,
          playerId: pick.playerId,
          player,
          board: bp,
          delta: graded && bp != null ? bp - pick.overall : null,
          proj: projections[pick.playerId]?.pts ?? null,
          team: teamsByRoster.get(pick.currentRosterId),
        })
      }
    }
    return out
  }, [board, players, boardPos, graded, projections, teamsByRoster])

  const drafted = useMemo(() => new Set(picks.map((p) => p.playerId)), [picks])

  /** Best players by board position that nobody took, with who has them now. */
  const undrafted = useMemo(
    () =>
      [...boardPos.entries()]
        .filter(([id]) => !drafted.has(id) && players[id])
        .sort((a, b) => a[1] - b[1])
        .slice(0, 10)
        .map(([id, bp]) => ({
          id,
          board: bp,
          player: players[id]!,
          owner: ownerOf.get(id),
          proj: projections[id]?.pts ?? null,
        })),
    [boardPos, drafted, players, ownerOf, projections]
  )

  const steal = useMemo(
    () =>
      picks
        .filter((p) => p.delta != null && p.delta > 0)
        .sort((a, b) => b.delta! - a.delta!)[0],
    [picks]
  )
  const reach = useMemo(
    () =>
      picks
        .filter((p) => p.delta != null && p.delta < 0)
        .sort((a, b) => a.delta! - b.delta!)[0],
    [picks]
  )
  const topProjected = useMemo(
    () => picks.filter((p) => p.proj != null).sort((a, b) => b.proj! - a.proj!)[0],
    [picks]
  )

  const posCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of picks) m.set(p.player.pos ?? '?', (m.get(p.player.pos ?? '?') ?? 0) + 1)
    return m
  }, [picks])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = picks.filter((p) => {
      if (pos !== 'ALL' && p.player.pos !== pos) return false
      if (!q) return true
      return (
        p.player.name.toLowerCase().includes(q) ||
        (p.player.college ?? '').toLowerCase().includes(q) ||
        (p.player.team ?? '').toLowerCase().includes(q) ||
        (p.team?.name ?? '').toLowerCase().includes(q)
      )
    })
    const factor = dir === 'asc' ? 1 : -1
    // Nulls always sort last regardless of direction — "unknown" is not "best".
    const num = (v: number | null) => (v == null ? Number.MAX_SAFE_INTEGER * factor : v)
    return filtered.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.player.name.localeCompare(b.player.name) * factor
        case 'age':
          return (num(a.player.age) - num(b.player.age)) * factor
        case 'board':
          return (num(a.board) - num(b.board)) * factor
        case 'delta':
          return (num(a.delta) - num(b.delta)) * factor
        case 'proj':
          return (num(a.proj) - num(b.proj)) * factor
        default:
          return (a.pick.overall - b.pick.overall) * factor
      }
    })
  }, [picks, pos, query, sort, dir])

  const toggle = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSort(key)
      // Projections and value read best-first; everything else ascending.
      setDir(key === 'proj' || key === 'delta' ? 'desc' : 'asc')
    }
  }

  const capturedAt = prospects.preDraftCapturedAt
    ? new Date(prospects.preDraftCapturedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  const total = draft.rounds * draft.teamCount

  return (
    <>
      <SectionTitle
        right={
          <span className="text-[11px] text-ink-5 tnum">
            {picks.length} of {total} picks ·{' '}
            {activePositions
              .filter((p) => posCounts.has(p))
              .map((p) => `${posCounts.get(p)} ${p}`)
              .join(' · ')}
          </span>
        }
      >
        {prospects.season} draft class
      </SectionTitle>

      {/* --------------------------------------------------------------- tiles */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Top projected pick"
          value={<PickTileValue entry={topProjected} />}
          sub={
            topProjected
              ? `${topProjected.pick.label} · ${pts1(topProjected.proj)} proj · ${topProjected.team?.name ?? '—'}`
              : undefined
          }
          accent="var(--color-teal)"
        />
        <StatTile
          label="Biggest steal"
          value={<PickTileValue entry={steal} />}
          sub={
            steal
              ? `${steal.pick.label} · ${ordinal(steal.board!)} on the board · ${steal.team?.name ?? '—'}`
              : graded
                ? 'nobody fell'
                : 'no pre-draft snapshot'
          }
          accent="var(--color-teal)"
        />
        <StatTile
          label="Biggest reach"
          value={<PickTileValue entry={reach} />}
          sub={
            reach
              ? `${reach.pick.label} · ${ordinal(reach.board!)} on the board · ${reach.team?.name ?? '—'}`
              : graded
                ? 'everyone stuck to the board'
                : 'no pre-draft snapshot'
          }
          accent="var(--color-rose)"
        />
        <StatTile
          label="Best undrafted"
          value={
            undrafted[0] ? (
              <span className="flex min-w-0 items-center gap-2">
                <PositionBadge pos={undrafted[0].player.pos} />
                <PlayerLink id={undrafted[0].id} className="min-w-0 truncate text-base">
                  {undrafted[0].player.name}
                </PlayerLink>
              </span>
            ) : (
              '—'
            )
          }
          sub={
            undrafted[0]
              ? `${ordinal(undrafted[0].board!)} on the board · ${
                  undrafted[0].owner ? `now on ${undrafted[0].owner.name}` : 'free agent'
                }`
              : undefined
          }
          accent="var(--color-amber)"
        />
      </div>

      {/* --------------------------------------------------------------- table */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={pos}
          onChange={setPos}
          options={[
            { value: 'ALL', label: 'All' },
            ...activePositions
              .filter((p) => posCounts.has(p))
              .map((p) => ({ value: p, label: `${p} ${posCounts.get(p)}` })),
          ]}
        />
        <div className="w-full sm:ml-auto sm:w-64">
          <SearchInput value={query} onChange={setQuery} placeholder="Player, college, team" />
        </div>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <Th sortable active={sort === 'pick'} dir={dir} onClick={() => toggle('pick')} className="w-16">
              Pick
            </Th>
            <Th>Team</Th>
            <Th sortable active={sort === 'name'} dir={dir} onClick={() => toggle('name')}>
              Player
            </Th>
            <Th className="w-16">Pos</Th>
            <Th className="w-16">NFL</Th>
            <Th sortable active={sort === 'board'} dir={dir} onClick={() => toggle('board')} align="right" className="w-16">
              Board
            </Th>
            <Th sortable active={sort === 'delta'} dir={dir} onClick={() => toggle('delta')} align="right" className="w-16">
              Value
            </Th>
            <Th sortable active={sort === 'proj'} dir={dir} onClick={() => toggle('proj')} align="right" className="w-20">
              Proj
            </Th>
            <Th sortable active={sort === 'age'} dir={dir} onClick={() => toggle('age')} align="right" className="w-14">
              Age
            </Th>
            <Th className="w-24" align="right">Size</Th>
            <Th>College</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.playerId}
              className={`border-t border-line/60 hover:bg-card-2/60 ${i % 2 ? 'bg-sunken/25' : ''} ${
                r.pick.wasTraded ? 'bg-amber/[0.05]' : ''
              }`}
            >
              <Td className="font-semibold text-ink-4 tnum">{r.pick.label}</Td>
              <Td>
                <TeamLink
                  rosterId={r.pick.currentRosterId}
                  name={r.team?.name ?? r.pick.currentTeam ?? `Roster ${r.pick.currentRosterId}`}
                  avatar={r.team?.avatar ?? null}
                  size={20}
                  className="text-xs font-medium text-ink-3"
                />
              </Td>
              <Td className="font-medium text-ink-2">
                <PlayerLink id={r.playerId}>{r.player.name}</PlayerLink>
              </Td>
              <Td>
                <PositionBadge pos={r.player.pos} />
              </Td>
              <Td className="text-ink-3">{r.player.team ?? <span className="text-ink-5">FA</span>}</Td>
              <Td align="right" className="text-ink-4 tnum">
                {r.board ?? '—'}
              </Td>
              <Td align="right" className="tnum">
                <Delta value={r.delta} />
              </Td>
              <Td align="right" className="text-ink-3 tnum">
                {r.proj == null ? <span className="text-ink-5">—</span> : pts1(r.proj)}
              </Td>
              <Td align="right" className="text-ink-4 tnum">
                {r.player.age ?? '—'}
              </Td>
              <Td align="right" className="text-ink-4 tnum">
                {height(r.player.ht) ?? '—'}
                {r.player.wt ? `, ${r.player.wt}` : ''}
              </Td>
              <Td className="text-ink-4">{r.player.college ?? '—'}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      {rows.length === 0 && (
        <div className="mt-3">
          <EmptyState title="No picks match" detail="Try clearing the search or position filter." />
        </div>
      )}

      <p className="mt-2 max-w-3xl text-[11px] leading-relaxed text-ink-5">
        {graded ? (
          <>
            Board is where Sleeper ranked the player within this rookie class
            {capturedAt ? ` as of ${capturedAt}, just before the first pick` : ' just before the draft'}.
            Value is board minus pick: positive means he fell, negative means someone jumped the
            board. Sleeper's ranking is one-QB, so in a superflex room the quarterback "reaches"
            are mostly the format, not the manager.
          </>
        ) : (
          <>
            No pre-draft rank snapshot exists for {prospects.season}, so Board reflects Sleeper's
            ranking today rather than draft night, and picks are not graded.
          </>
        )}{' '}
        Proj is {prospects.season} season projection, scored with this league's settings.
      </p>

      {/* ----------------------------------------------------------- undrafted */}
      {undrafted.length > 0 && (
        <div className="mt-6">
          <SectionTitle
            right={<span className="text-[11px] text-ink-5">by pre-draft board</span>}
          >
            Best undrafted
          </SectionTitle>
          <Card padded={false}>
            {undrafted.map((u, i) => (
              <div
                key={u.id}
                className={`flex items-center gap-3 px-3.5 py-2.5 ${i ? 'border-t border-line/60' : ''}`}
              >
                <span className="w-7 shrink-0 text-right text-[11px] font-semibold text-ink-5 tnum">
                  {u.board}
                </span>
                <PositionBadge pos={u.player.pos} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-2">
                    <PlayerLink id={u.id}>{u.player.name}</PlayerLink>
                  </div>
                  <div className="truncate text-[11px] text-ink-5">
                    {[u.player.team ?? 'FA', u.player.college].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {u.proj != null && (
                  <span className="shrink-0 text-right text-[11px] text-ink-4 tnum">
                    {pts1(u.proj)}
                    <span className="block text-[9px] text-ink-5">proj</span>
                  </span>
                )}
                <span className="w-36 shrink-0 text-right text-[11px]">
                  {u.owner ? (
                    <TeamLink
                      rosterId={u.owner.rosterId}
                      name={u.owner.name}
                      showAvatar={false}
                      className="justify-end text-ink-4"
                    />
                  ) : (
                    <span className="rounded bg-teal/15 px-1.5 py-0.5 text-[10px] font-bold text-teal">
                      FREE AGENT
                    </span>
                  )}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </>
  )
}
