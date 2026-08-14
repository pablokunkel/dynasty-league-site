import { useMemo } from 'react'
import type { Manifest, SeasonDoc, Team } from '../lib/types'
import { pts1, record } from '../lib/format'
import { Avatar, Card, SectionTitle, TableWrap, Td, TeamLink, Th } from './ui'

/* ------------------------------------------------------------------ shared */

/**
 * Rank teams by wins, giving every team on the same win total the same place —
 * so a four-way tie at 5 wins all read "3" rather than 3/4/5/6. Points For
 * still orders them within the group.
 */
function withPlaces(teams: Team[]) {
  const sorted = [...teams].sort(
    (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
  )
  let place = 0
  let lastWins: number | null = null
  return sorted.map((t) => {
    if (t.wins !== lastWins) {
      place += 1
      lastWins = t.wins
    }
    return { ...t, place }
  })
}

/** PF as a share of the optimal lineup — how well a manager sets their roster. */
const accuracy = (t: Team) =>
  t.potentialPoints > 0 ? t.pointsFor / t.potentialPoints : null

/* --------------------------------------------------------------- standings */

export function Standings({
  season,
  seasonYear,
}: {
  season: SeasonDoc
  seasonYear: string
}) {
  const rows = useMemo(() => withPlaces(season.teams), [season.teams])

  // Star the most efficient manager — the accuracy leader.
  const bestAccuracy = useMemo(() => {
    const vals = rows.map(accuracy).filter((v): v is number => v != null)
    return vals.length ? Math.max(...vals) : null
  }, [rows])

  return (
    <section>
      <SectionTitle
        right={<span className="text-[11px] text-ink-5">{seasonYear} regular season</span>}
      >
        Standings
      </SectionTitle>

      <TableWrap>
        <thead>
          <tr>
            <Th className="w-12" align="right">Place</Th>
            <Th>Team</Th>
            <Th className="w-10" align="right">W</Th>
            <Th className="w-10" align="right">L</Th>
            <Th className="w-10" align="right">T</Th>
            <Th className="w-24" align="right">PF</Th>
            <Th className="w-24" align="right">PA</Th>
            <Th className="w-24" align="right">Diff</Th>
            <Th className="w-24" align="right">Max PF</Th>
            <Th className="w-24" align="right">Accuracy</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const diff = t.pointsFor - t.pointsAgainst
            const acc = accuracy(t)
            const isBest = acc != null && acc === bestAccuracy
            return (
              <tr
                key={t.rosterId}
                className={`border-t border-line/60 hover:bg-card-2/60 ${
                  i % 2 ? 'bg-sunken/25' : ''
                }`}
              >
                <Td align="right" className="font-semibold text-ink-4 tnum">
                  {t.place}
                </Td>
                <Td>
                  <TeamLink
                    rosterId={t.rosterId}
                    name={t.name}
                    season={seasonYear}
                    avatar={t.avatar}
                    size={24}
                    className="font-medium text-ink-2"
                  />
                </Td>
                <Td align="right" className="font-semibold text-ink-2 tnum">{t.wins}</Td>
                <Td align="right" className="text-ink-4 tnum">{t.losses}</Td>
                <Td align="right" className="text-ink-5 tnum">{t.ties}</Td>
                <Td align="right" className="text-ink-3 tnum">{pts1(t.pointsFor)}</Td>
                <Td align="right" className="text-ink-5 tnum">{pts1(t.pointsAgainst)}</Td>
                <Td
                  align="right"
                  className="tnum"
                  // Point differential is the one number where sign carries the
                  // meaning, so it gets colour rather than another grey.
                >
                  <span style={{ color: diff >= 0 ? 'var(--color-teal)' : 'var(--color-rose)' }}>
                    {diff >= 0 ? '+' : '−'}
                    {pts1(Math.abs(diff))}
                  </span>
                </Td>
                <Td align="right" className="text-ink-4 tnum">{pts1(t.potentialPoints)}</Td>
                <Td align="right" className="tnum">
                  {acc == null ? (
                    <span className="text-ink-5">—</span>
                  ) : (
                    <span className={isBest ? 'font-bold text-amber' : 'text-ink-3'}>
                      {(acc * 100).toFixed(1)}%{isBest && ' ★'}
                    </span>
                  )}
                </Td>
              </tr>
            )
          })}
        </tbody>
      </TableWrap>

      <p className="mt-2 text-[11px] text-ink-5">
        Max PF is the optimal lineup — what you'd have scored starting the right players.
        Accuracy is PF ÷ Max PF; ★ marks the most efficient manager.
      </p>
    </section>
  )
}

/* --------------------------------------------------------------- tankathon */

export function Tankathon({
  season,
  seasonYear,
  manifest,
}: {
  season: SeasonDoc
  seasonYear: string
  manifest: Manifest
}) {
  /*
   * Per the bylaws the rookie draft order is ascending regular-season Max
   * Points For — the worst optimal-lineup team picks first. So this is a live
   * projection of next year's order, with traded picks resolved to whoever
   * actually holds them.
   */
  const draftYear = String(Number(seasonYear) + 1)

  const order = useMemo(() => {
    const byRoster = new Map(season.teams.map((t) => [t.rosterId, t]))

    const tradedRound1 = new Map<number, number>()
    for (const tp of season.tradedPicks) {
      if (tp.season === draftYear && tp.round === 1) {
        tradedRound1.set(tp.roster_id, tp.owner_id)
      }
    }

    return [...season.teams]
      .sort((a, b) => a.potentialPoints - b.potentialPoints)
      .map((original, i) => {
        const ownerId = tradedRound1.get(original.rosterId) ?? original.rosterId
        const owner = byRoster.get(ownerId)
        return {
          pick: i + 1,
          original,
          owner: owner ?? original,
          wasTraded: ownerId !== original.rosterId,
        }
      })
  }, [season.teams, season.tradedPicks, draftYear])

  const cfg = manifest.tankathon

  return (
    <section>
      <SectionTitle
        right={
          <span className="text-[11px] text-ink-5">
            {draftYear} round 1 · by {seasonYear} Max PF
          </span>
        }
      >
        {cfg.title}
      </SectionTitle>

      <Card padded={false}>
        <div className="border-b border-line bg-sunken/40 px-3.5 py-2.5">
          <div className="text-sm font-bold text-rose">"{cfg.subtitle}"</div>
          <div className="mt-0.5 text-[11px] text-ink-5">
            {season.status === 'complete'
              ? `Set by ${seasonYear} Max PF. Worst optimal lineup picks first, per the bylaws.`
              : `Chasing ${cfg.prospect}. Worst Max PF picks first, per the bylaws.`}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr>
                <Th className="w-12" align="right">Pick</Th>
                <Th>Pick owner</Th>
                <Th>Original owner</Th>
                <Th className="w-24" align="right">Max PF</Th>
              </tr>
            </thead>
            <tbody>
              {order.map((o, i) => (
                <tr
                  key={o.pick}
                  className={`border-t border-line/60 hover:bg-card-2/60 ${
                    i % 2 ? 'bg-sunken/25' : ''
                  } ${o.wasTraded ? 'bg-amber/[0.05]' : ''}`}
                >
                  <Td align="right" className="font-bold text-ink-4 tnum">{o.pick}</Td>
                  <Td>
                    <TeamLink
                      rosterId={o.owner.rosterId}
                      name={o.owner.name}
                      season={manifest.currentSeason}
                      avatar={o.owner.avatar}
                      size={22}
                      className="font-medium text-ink-2"
                    />
                  </Td>
                  <Td>
                    {o.wasTraded ? (
                      <span className="flex items-center gap-1.5">
                        <Avatar src={o.original.avatar} name={o.original.name} size={18} />
                        <span className="text-ink-5">{o.original.name}</span>
                        <span className="rounded bg-amber/15 px-1 py-0.5 text-[9px] font-bold uppercase text-amber">
                          traded
                        </span>
                      </span>
                    ) : (
                      <span className="text-ink-5">—</span>
                    )}
                  </Td>
                  <Td align="right" className="text-ink-4 tnum">
                    {pts1(o.original.potentialPoints)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-2 text-[11px] text-ink-5">
        {season.status === 'complete' ? (
          <>
            Final — {seasonYear} is complete, so this is the locked {draftYear} order.
          </>
        ) : (
          <>Projection — the order locks when the {seasonYear} regular season ends.</>
        )}{' '}
        Rounds 2 and 3 repeat it, since the draft is linear rather than a snake.
      </p>
    </section>
  )
}

/** Record line used by both tables' compact variants. */
export const teamRecord = (t: Team) => record(t.wins, t.losses, t.ties)
