/**
 * Weekly recap statistics — the deterministic half of a recap.
 *
 * Everything here is pure arithmetic over the committed matchup data: who beat
 * whom, by how much, who left points on the bench, and where the standings sit
 * afterwards. The prose (template or Claude-written) is layered on top by
 * scripts/write-recaps.mjs; keeping the two apart means a rewrite of the words
 * never changes the numbers, and the numbers can be recomputed for any past
 * week without touching the words.
 *
 * Shared by the writer and by fetch-sleeper.mjs, which bundles the per-week
 * files under content/recaps into one public/data/recaps/{season}.json.
 */

import { readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const round2 = (n) => Math.round(n * 100) / 100

/**
 * Which positions may fill a roster slot. Sleeper's flex names are fixed
 * strings; anything not listed is a single-position slot named after itself.
 */
const SLOT_ELIGIBILITY = {
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
}
export const eligibleFor = (slot) => SLOT_ELIGIBILITY[slot] ?? [slot]

/**
 * Best possible lineup from everyone on the roster that week.
 *
 * Greedy, narrowest slot first: the single-position slots take the top scorers
 * at their position, then FLEX picks the best of what is left, then
 * SUPER_FLEX. Because each flex slot's eligibility contains the narrower ones
 * (FLEX ⊂ SUPER_FLEX, and a strict slot ⊂ both), taking the best available at
 * each step is optimal — any lineup that skipped a higher scorer for a narrower
 * slot could swap him in without displacing anything it needs. This is what
 * Sleeper's own `ppts` (Max Points For) measures.
 *
 * Checked against 2025: the season totals match Sleeper's ppts to the cent for
 * 11 of 12 teams. The twelfth is 21.4 low over 14 weeks, almost certainly a
 * player Sleeper lists with two `fantasy_positions` (eligible for a second
 * slot) — the slim index only carries the primary position. Close enough for a
 * recap; not worth 14MB of extra player data.
 */
export function optimalLineup(side, players, slots) {
  const candidates = Object.entries(side.playersPoints ?? {})
    .map(([id, p]) => ({ id, points: Number(p) || 0, pos: players[id]?.pos ?? null }))
    .filter((c) => c.pos)

  const order = slots
    .map((slot, i) => ({ slot, i, eligible: eligibleFor(slot) }))
    .sort((a, b) => a.eligible.length - b.eligible.length || a.i - b.i)

  const used = new Set()
  const lineup = new Array(slots.length)
  for (const s of order) {
    let best = null
    for (const c of candidates) {
      if (used.has(c.id) || !s.eligible.includes(c.pos)) continue
      if (!best || c.points > best.points) best = c
    }
    if (best) used.add(best.id)
    lineup[s.i] = { slot: s.slot, id: best?.id ?? null, points: best?.points ?? 0 }
  }
  return {
    optimal: round2(lineup.reduce((n, l) => n + l.points, 0)),
    lineup,
  }
}

const playerRef = (id, points, players) => {
  const p = players[id]
  return {
    id,
    name: p?.name ?? `#${id}`,
    pos: p?.pos ?? null,
    nfl: p?.team ?? null,
    points: round2(points),
  }
}

/** One team's line in a game: score, optimal, who carried them, what they benched. */
function describeSide(side, players, slots, teams) {
  const team = teams.get(side.rosterId)
  const { optimal } = optimalLineup(side, players, slots)

  let top = null
  side.starters.forEach((id, i) => {
    const pts = side.startersPoints[i] ?? 0
    if (!top || pts > top.points) top = playerRef(id, pts, players)
  })

  const started = new Set(side.starters)
  let bestBench = null
  for (const [id, pts] of Object.entries(side.playersPoints ?? {})) {
    if (started.has(id)) continue
    if (!bestBench || pts > bestBench.points) bestBench = playerRef(id, pts, players)
  }

  return {
    rosterId: side.rosterId,
    name: team?.name ?? `Roster ${side.rosterId}`,
    points: round2(side.points),
    optimal,
    benchLeft: Math.max(0, round2(optimal - side.points)),
    topPlayer: top,
    bestBench: bestBench && bestBench.points > 0 ? bestBench : null,
  }
}

const maxBy = (xs, f) =>
  xs.reduce((best, x) => (best == null || f(x) > f(best) ? x : best), null)
const minBy = (xs, f) =>
  xs.reduce((best, x) => (best == null || f(x) < f(best) ? x : best), null)

/**
 * Regular-season table after `week`, with each team's movement since the
 * previous week. Computed from the matchups rather than roster settings so it
 * is correct for any past week, not just "now".
 */
export function standingsAfter(season, matchups, week) {
  const playoffStart = season.settings?.playoffWeekStart ?? null
  const lastRegular = playoffStart != null ? Math.min(week, playoffStart - 1) : week

  const table = (through) => {
    const rows = new Map(
      season.teams.map((t) => [
        t.rosterId,
        { rosterId: t.rosterId, name: t.name, wins: 0, losses: 0, ties: 0, pointsFor: 0, pointsAgainst: 0 },
      ])
    )
    for (const w of matchups) {
      if (w.week > through) continue
      for (const m of w.matchups) {
        if (m.sides.length < 2) continue
        const [a, b] = m.sides
        const ra = rows.get(a.rosterId)
        const rb = rows.get(b.rosterId)
        if (!ra || !rb) continue
        ra.pointsFor += a.points
        ra.pointsAgainst += b.points
        rb.pointsFor += b.points
        rb.pointsAgainst += a.points
        if (a.points > b.points) {
          ra.wins++
          rb.losses++
        } else if (b.points > a.points) {
          rb.wins++
          ra.losses++
        } else {
          ra.ties++
          rb.ties++
        }
      }
    }
    const sorted = [...rows.values()].sort(
      (x, y) => y.wins - x.wins || y.pointsFor - x.pointsFor
    )
    // Same win total, same place — the way the Home standings read.
    let place = 0
    let lastWins = null
    return sorted.map((r) => {
      if (r.wins !== lastWins) {
        place++
        lastWins = r.wins
      }
      return { ...r, pointsFor: round2(r.pointsFor), pointsAgainst: round2(r.pointsAgainst), place }
    })
  }

  const now = table(lastRegular)
  const before = new Map(table(lastRegular - 1).map((r) => [r.rosterId, r.place]))
  return now.map((r) => ({ ...r, movement: (before.get(r.rosterId) ?? r.place) - r.place }))
}

/** True when a week has at least one two-sided matchup with points on the board. */
export function weekHasGames(weekDoc) {
  return (
    weekDoc != null &&
    weekDoc.matchups.some((m) => m.sides.length >= 2 && m.sides.some((s) => s.points > 0))
  )
}

/**
 * Everything a recap needs to say about a week, minus the words.
 */
export function computeWeekRecap({ season, matchups, players, week }) {
  const weekDoc = matchups.find((m) => m.week === week)
  if (!weekDoc) throw new Error(`no matchup data for ${season.season} week ${week}`)

  const teams = new Map(season.teams.map((t) => [t.rosterId, t]))
  const slots = season.rosterPositions.filter((p) => p !== 'BN')
  const playoffStart = season.settings?.playoffWeekStart ?? null
  const isPlayoffs = playoffStart != null && week >= playoffStart

  const games = []
  for (const m of weekDoc.matchups) {
    // Single-sided entries are byes (or, in playoff weeks, eliminated teams
    // still accruing points). Neither is a game.
    if (m.sides.length < 2) continue
    const [a, b] = m.sides.map((s) => describeSide(s, players, slots, teams))
    const tie = a.points === b.points
    const [winner, loser] = a.points >= b.points ? [a, b] : [b, a]
    games.push({ winner, loser, margin: round2(Math.abs(a.points - b.points)), tie })
  }

  const sides = games.flatMap((g) => [g.winner, g.loser])
  const decided = games.filter((g) => !g.tie)
  const withTop = sides.filter((s) => s.topPlayer)
  const blunder = maxBy(sides, (s) => s.benchLeft)

  const teamRef = (s) => s && { rosterId: s.rosterId, name: s.name, points: s.points }
  const gameRef = (g) =>
    g && { winner: teamRef(g.winner), loser: teamRef(g.loser), margin: g.margin }

  return {
    season: season.season,
    week,
    isPlayoffs,
    games,
    awards: {
      highScore: teamRef(maxBy(sides, (s) => s.points)),
      lowScore: teamRef(minBy(sides, (s) => s.points)),
      closest: gameRef(minBy(decided, (g) => g.margin)),
      blowout: gameRef(maxBy(decided, (g) => g.margin)),
      benchBlunder:
        blunder && blunder.benchLeft > 0
          ? { rosterId: blunder.rosterId, name: blunder.name, left: blunder.benchLeft, player: blunder.bestBench }
          : null,
      topPlayer: (() => {
        const s = maxBy(withTop, (x) => x.topPlayer.points)
        return s ? { ...s.topPlayer, rosterId: s.rosterId, team: s.name } : null
      })(),
    },
    standings: standingsAfter(season, matchups, week),
  }
}

/* ------------------------------------------------------------------ bundle */

export const recapsDir = (root, season) => join(root, 'content', 'recaps', String(season))
export const recapFile = (root, season, week) =>
  join(recapsDir(root, season), `week-${String(week).padStart(2, '0')}.json`)

/**
 * All committed recaps for a season, oldest first. Missing directory means no
 * recaps yet — an empty array, never an error, so the build cannot fail on it.
 */
export async function bundleRecaps(root, season) {
  const dir = recapsDir(root, season)
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter((f) => /^week-\d{2}\.json$/.test(f)).sort()
  const out = []
  for (const f of files) {
    try {
      out.push(JSON.parse(await readFile(join(dir, f), 'utf8')))
    } catch (err) {
      console.warn(`  ! skipping unreadable recap ${season}/${f}: ${err.message}`)
    }
  }
  return out.sort((a, b) => a.week - b.week)
}
