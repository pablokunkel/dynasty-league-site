#!/usr/bin/env node
/**
 * Sleeper -> static JSON pipeline.
 *
 * Walks the league chain backwards via previous_league_id, pulls everything the
 * site needs, and writes per-season files to public/data so no page ever loads
 * more than it uses.
 *
 * Measured 2026-08-14 against league 1318724589848653824:
 *   - 6 seasons (2021-2026), all endpoints public and unauthenticated
 *   - 2,768 transactions / ~966KB raw, 90 weeks of matchups / ~732KB raw
 *   - players/nfl is 14.6MB and is pruned here to only referenced players
 *
 * Run: npm run data          (uses cached player dump if fresh)
 *      npm run data:full     (forces a re-download of the player dump)
 */

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public', 'data')
const CACHE = join(ROOT, '.cache')
const API = 'https://api.sleeper.app'

const FULL = process.argv.includes('--full')
const PLAYER_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000 // player metadata moves slowly

// Sleeper's docs ask for well under 1000 calls/min. We make ~250; this keeps
// us polite without making the run slow.
const CONCURRENCY = 8

/** Weeks to sweep. Sleeper returns [] past the end of a season, which is cheap. */
const MAX_WEEK = 18

// ---------------------------------------------------------------------------
// fetch helpers
// ---------------------------------------------------------------------------

let requestCount = 0

async function api(path, { allowEmpty = true } = {}) {
  const url = `${API}${path}`
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url)
      requestCount++
      if (res.status === 404) {
        if (allowEmpty) return null
        throw new Error(`404 ${url}`)
      }
      if (res.status === 429) {
        // Back off and retry rather than silently returning a hole in the data.
        await sleep(1000 * attempt)
        continue
      }
      if (!res.ok) throw new Error(`${res.status} ${url}`)
      const text = await res.text()
      return text === 'null' || text === '' ? null : JSON.parse(text)
    } catch (err) {
      if (attempt === 4) throw new Error(`Failed after 4 attempts: ${url} — ${err.message}`)
      await sleep(400 * attempt)
    }
  }
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Run tasks with a fixed concurrency ceiling, preserving input order. */
async function pool(items, fn, limit = CONCURRENCY) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return results
}

async function writeJson(relPath, data) {
  const full = join(OUT, relPath)
  await mkdir(dirname(full), { recursive: true })
  const body = JSON.stringify(data)
  await writeFile(full, body)
  return { path: relPath, bytes: Buffer.byteLength(body) }
}

// ---------------------------------------------------------------------------
// domain helpers
// ---------------------------------------------------------------------------

/** Sleeper splits fantasy points into integer + hundredths. Recombine. */
const pts = (whole, decimal) => Number(whole ?? 0) + Number(decimal ?? 0) / 100

/** Display label for a Sleeper user: team name if set, else display name. */
const teamLabel = (user) =>
  user?.metadata?.team_name?.trim() || user?.display_name || 'Unknown'

const avatarUrl = (user) =>
  user?.metadata?.avatar || (user?.avatar ? `https://sleepercdn.com/avatars/${user.avatar}` : null)

/**
 * Sleeper bracket rows carry `p` = the placement being contested. Winner takes
 * `p`, loser takes `p + 1`. Losers-bracket placements are offset by the number
 * of playoff teams, so a losers-bracket `p:1` is really 7th in a 6-team
 * playoff. Verified against the 2025 bracket, where losers `p:5` loser is the
 * genuine last-place team.
 */
function placementsFromBracket(bracket, offset = 0) {
  const places = new Map()
  for (const m of bracket ?? []) {
    if (m.p == null || m.w == null || m.l == null) continue
    places.set(m.w, m.p + offset)
    places.set(m.l, m.p + 1 + offset)
  }
  return places
}

// ---------------------------------------------------------------------------
// per-season fetch
// ---------------------------------------------------------------------------

async function fetchSeason(leagueId) {
  const league = await api(`/v1/league/${leagueId}`, { allowEmpty: false })
  const season = league.season

  const [users, rosters, drafts, winners, losers, leagueTradedPicks] = await Promise.all([
    api(`/v1/league/${leagueId}/users`),
    api(`/v1/league/${leagueId}/rosters`),
    api(`/v1/league/${leagueId}/drafts`),
    api(`/v1/league/${leagueId}/winners_bracket`),
    api(`/v1/league/${leagueId}/losers_bracket`),
    api(`/v1/league/${leagueId}/traded_picks`),
  ])

  const weeks = Array.from({ length: MAX_WEEK }, (_, i) => i + 1)

  const matchupWeeks = await pool(weeks, async (w) => ({
    week: w,
    entries: (await api(`/v1/league/${leagueId}/matchups/${w}`)) ?? [],
  }))

  const txWeeks = await pool(weeks, async (w) => ({
    week: w,
    entries: (await api(`/v1/league/${leagueId}/transactions/${w}`)) ?? [],
  }))

  return {
    season,
    leagueId,
    league,
    users: users ?? [],
    rosters: rosters ?? [],
    drafts: drafts ?? [],
    winners: winners ?? [],
    losers: losers ?? [],
    leagueTradedPicks: leagueTradedPicks ?? [],
    matchupWeeks: matchupWeeks.filter((m) => m.entries.length > 0),
    txWeeks: txWeeks.filter((t) => t.entries.length > 0),
  }
}

// ---------------------------------------------------------------------------
// shaping
// ---------------------------------------------------------------------------

function shapeTeams(raw) {
  const usersById = new Map(raw.users.map((u) => [u.user_id, u]))
  const playoffTeams = raw.league.settings?.playoff_teams ?? 6

  const winnerPlaces = placementsFromBracket(raw.winners, 0)
  const loserPlaces = placementsFromBracket(raw.losers, playoffTeams)
  const finalPlace = new Map([...winnerPlaces, ...loserPlaces])

  return raw.rosters.map((r) => {
    const user = usersById.get(r.owner_id)
    const s = r.settings ?? {}
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      name: teamLabel(user),
      handle: user?.display_name ?? null,
      avatar: avatarUrl(user),
      wins: s.wins ?? 0,
      losses: s.losses ?? 0,
      ties: s.ties ?? 0,
      pointsFor: pts(s.fpts, s.fpts_decimal),
      pointsAgainst: pts(s.fpts_against, s.fpts_against_decimal),
      // ppts = "potential points", i.e. the optimal lineup. Only populated on
      // completed seasons; drives the lineup-efficiency stat on Records.
      potentialPoints: pts(s.ppts, s.ppts_decimal),
      waiverBudgetUsed: s.waiver_budget_used ?? 0,
      waiverPosition: s.waiver_position ?? null,
      totalMoves: s.total_moves ?? 0,
      players: r.players ?? [],
      starters: (r.starters ?? []).filter((p) => p && p !== '0'),
      taxi: r.taxi ?? [],
      reserve: r.reserve ?? [],
      finalPlace: finalPlace.get(r.roster_id) ?? null,
    }
  })
}

function shapeTransactions(raw, teamsByRoster) {
  const out = []
  for (const { week, entries } of raw.txWeeks) {
    for (const t of entries) {
      const rosterIds = t.roster_ids ?? []
      out.push({
        id: t.transaction_id,
        week,
        season: raw.season,
        type: t.type, // free_agent | waiver | trade | commissioner
        status: t.status,
        created: t.created,
        rosterIds,
        teams: rosterIds.map((id) => teamsByRoster.get(id)?.name ?? `Roster ${id}`),
        adds: t.adds ?? null, // { playerId: rosterId }
        drops: t.drops ?? null,
        draftPicks: t.draft_picks ?? [],
        faab: t.settings?.waiver_bid ?? null,
        budgetMoves: t.waiver_budget ?? [],
      })
    }
  }
  // Descending by time — the transaction log's default order.
  return out.sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
}

function shapeMatchups(raw) {
  const weeks = []
  for (const { week, entries } of raw.matchupWeeks) {
    // Sleeper returns one row per roster; matchup_id pairs them up.
    const byMatchup = new Map()
    for (const e of entries) {
      const key = e.matchup_id ?? `bye-${e.roster_id}`
      if (!byMatchup.has(key)) byMatchup.set(key, [])
      byMatchup.get(key).push({
        rosterId: e.roster_id,
        points: e.points ?? 0,
        starters: (e.starters ?? []).filter((p) => p && p !== '0'),
        startersPoints: e.starters_points ?? [],
        playersPoints: e.players_points ?? {},
      })
    }
    weeks.push({
      week,
      matchups: [...byMatchup.values()].map((sides) => ({ sides })),
    })
  }
  return weeks
}

/**
 * Google Docs exports bold paragraphs as `**LABEL:**` rather than real headings,
 * so a doc that reads as sectioned produces zero `#` headings and an empty table
 * of contents. Promote all-caps bold labels to h2 so /bylaws gets a real TOC.
 */
function normalizeBylaws(md, replacements = []) {
  // The doc is written in the commissioner's first person. Apply the configured
  // rewrites first, and warn loudly on any that match nothing — after a re-export
  // a reworded sentence would otherwise silently leave "me" on the page.
  let out = md
  for (const [from, to] of replacements) {
    if (!out.includes(from)) {
      console.warn(`  ! bylaws replacement matched nothing: ${JSON.stringify(from.slice(0, 60))}`)
      continue
    }
    out = out.split(from).join(to)
  }

  return out.replace(
    /^\*\*([A-Z][A-Z0-9 /&'-]{2,}):\*\*[ \t]*(.*)$/gm,
    (_, label, rest) => `## ${label.trim()}${rest.trim() ? `\n\n${rest.trim()}` : ''}`
  )
}

/**
 * Per-week actuals and projections, for the player profile game log.
 *
 * Each week is a ~2MB payload, so this is the most expensive part of the run
 * (36 requests, ~70MB downloaded). Everything is pruned to referenced players
 * before it lands on disk — the output is a few hundred KB and is lazily loaded
 * by the client only when a profile is first opened.
 */
async function fetchWeeklyPoints(currentSeason, previousSeason, scoring, referenced) {
  const positions = ['QB', 'RB', 'WR', 'TE'].map((p) => `position[]=${p}`).join('&')
  const weeks = Array.from({ length: MAX_WEEK }, (_, i) => i + 1)

  const grabWeek = async (kind, season, week) => {
    const base = kind === 'proj' ? 'projections' : 'stats'
    try {
      const res = await fetch(
        `${API}/${base}/nfl/${season}/${week}?season_type=regular&${positions}`
      )
      requestCount++
      if (!res.ok) return null
      const raw = await res.json()
      const rows = Array.isArray(raw)
        ? raw.map((r) => [r.player_id, r.stats ?? r])
        : Object.entries(raw)
      const out = []
      for (const [id, stats] of rows) {
        if (!referenced.has(id)) continue
        const p = scoreLine(stats, scoring)
        if (p == null || p === 0) continue
        out.push([id, week, p])
      }
      return out
    } catch {
      return null
    }
  }

  // { playerId: { proj: {week: pts}, act: {week: pts} } }
  const byPlayer = {}
  const add = (kind, rows) => {
    for (const [id, week, p] of rows ?? []) {
      byPlayer[id] ??= { proj: {}, act: {} }
      byPlayer[id][kind][week] = p
    }
  }

  const projRows = await pool(weeks, (w) => grabWeek('proj', currentSeason, w), 6)
  projRows.forEach((r) => add('proj', r))

  if (previousSeason) {
    const actRows = await pool(weeks, (w) => grabWeek('act', previousSeason, w), 6)
    actRows.forEach((r) => add('act', r))
  }

  return byPlayer
}

/**
 * Build-time RSS fetch. Doing this here rather than in the browser sidesteps
 * CORS entirely — none of these feeds send permissive headers.
 *
 * Deliberately a small regex parser rather than an XML dependency: these are
 * two known feeds with plain <item> structures, and a parse failure degrades to
 * "no news" instead of breaking the build.
 */
/**
 * Parse an RSS date, correcting for feeds that label daylight time as standard.
 *
 * ESPN stamps every item `EST` year-round. `Date.parse` dutifully reads that as
 * UTC-5, so in summer every headline lands an hour in the future — later than
 * our own fetch time, which made them all render as "just now". Rotowire sends
 * proper numeric offsets and is unaffected.
 *
 * Returns null rather than a wrong number when the date is unusable; the UI
 * already renders null as "undated".
 */
const US_STANDARD_ZONES = /\b(EST|CST|MST|PST)\b/

/** ms for the nth Sunday of a month at a given UTC hour. */
function nthSundayUtc(year, monthIndex, n, utcHour) {
  const d = new Date(Date.UTC(year, monthIndex, 1))
  const firstSunday = 1 + ((7 - d.getUTCDay()) % 7)
  return Date.UTC(year, monthIndex, firstSunday + (n - 1) * 7, utcHour)
}

/** US DST: 2nd Sunday of March 07:00 UTC through 1st Sunday of November 06:00 UTC. */
function inUsDst(ms) {
  const year = new Date(ms).getUTCFullYear()
  return ms >= nthSundayUtc(year, 2, 2, 7) && ms < nthSundayUtc(year, 10, 1, 6)
}

function parseFeedDate(raw) {
  if (!raw) return null
  const ts = Date.parse(raw)
  if (!Number.isFinite(ts)) return null
  if (US_STANDARD_ZONES.test(raw) && inUsDst(ts)) return ts - 3_600_000
  return ts
}

async function fetchNews(config) {
  const items = []

  const decode = (s = '') =>
    s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .trim()

  const tag = (block, name) => {
    const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
    return m ? decode(m[1]) : null
  }

  for (const feed of config.news?.feeds ?? []) {
    try {
      const res = await fetch(feed.url, {
        headers: { 'user-agent': 'dynasty-league-site/1.0 (+build-time RSS fetch)' },
      })
      requestCount++
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()

      for (const block of xml.match(/<item[\s\S]*?<\/item>/gi) ?? []) {
        const title = tag(block, 'title')
        const link = tag(block, 'link')
        if (!title || !link) continue
        items.push({
          source: feed.name,
          title,
          link,
          description: (tag(block, 'description') ?? '').slice(0, 240) || null,
          published: parseFeedDate(tag(block, 'pubDate') ?? tag(block, 'dc:date')),
        })
      }
    } catch (err) {
      console.warn(`  ! news feed "${feed.name}" unavailable (${err.message})`)
    }
  }

  // Newest first, undated last, then interleave so one chatty feed can't own
  // the whole list.
  items.sort((a, b) => (b.published ?? 0) - (a.published ?? 0))
  const bySource = new Map()
  for (const it of items) {
    if (!bySource.has(it.source)) bySource.set(it.source, [])
    bySource.get(it.source).push(it)
  }
  const queues = [...bySource.values()]
  const interleaved = []
  const max = config.news?.maxItems ?? 12
  while (interleaved.length < max && queues.some((q) => q.length)) {
    for (const q of queues) {
      if (!q.length || interleaved.length >= max) continue
      interleaved.push(q.shift())
    }
  }
  return interleaved
}

function shapeDraft(draft, picks, tradedPicks, teamsByRoster, priorMaxPoints) {
  if (!draft) return null

  const slotToRoster = draft.slot_to_roster_id ?? {}
  const rounds = draft.settings?.rounds ?? 0
  const teamCount = draft.settings?.teams ?? Object.keys(slotToRoster).length
  const isLinear = draft.type === 'linear'

  // Who currently owns each (round, originalRoster) pick.
  const owned = new Map()
  for (const tp of tradedPicks ?? []) {
    owned.set(`${tp.round}:${tp.roster_id}`, {
      currentOwner: tp.owner_id,
      previousOwner: tp.previous_owner_id,
    })
  }

  const pickByRoundSlot = new Map()
  for (const p of picks ?? []) pickByRoundSlot.set(`${p.round}:${p.draft_slot}`, p)

  const board = []
  for (let round = 1; round <= rounds; round++) {
    const slots = Array.from({ length: teamCount }, (_, i) => i + 1)
    // Linear repeats the same order every round; snake reverses even rounds.
    const ordered = isLinear || round % 2 === 1 ? slots : [...slots].reverse()

    board.push({
      round,
      picks: ordered.map((slot, idx) => {
        const originalRoster = slotToRoster[String(slot)]
        const trade = owned.get(`${round}:${originalRoster}`)
        const currentRoster = trade?.currentOwner ?? originalRoster
        const made = pickByRoundSlot.get(`${round}:${slot}`)
        return {
          round,
          slot,
          overall: (round - 1) * teamCount + idx + 1,
          label: `${round}.${String(idx + 1).padStart(2, '0')}`,
          originalRosterId: originalRoster,
          originalTeam: teamsByRoster.get(originalRoster)?.name ?? null,
          currentRosterId: currentRoster,
          currentTeam: teamsByRoster.get(currentRoster)?.name ?? null,
          wasTraded: currentRoster !== originalRoster,
          playerId: made?.player_id ?? null,
          pickedAt: made?.metadata ? made.picked_by || null : null,
          // Bylaws set the order by reverse prior-season Max Points For
          // (Sleeper's `ppts`). Carrying it through lets the board show why
          // each slot sits where it does. Verified to match exactly for 2026.
          priorMaxPoints:
            priorMaxPoints?.get(teamsByRoster.get(originalRoster)?.ownerId) ?? null,
        }
      }),
    })
  }

  return {
    draftId: draft.draft_id,
    status: draft.status,
    type: draft.type,
    rounds,
    teamCount,
    // Confirmed null on this league — the countdown comes from league.config.json.
    startTime: draft.start_time,
    scoringType: draft.metadata?.scoring_type ?? null,
    board,
    madePickCount: (picks ?? []).length,
  }
}

// ---------------------------------------------------------------------------
// records
// ---------------------------------------------------------------------------

function buildRecords(seasons) {
  const seasonRecords = []
  const allTime = new Map() // ownerId -> aggregate

  for (const s of seasons) {
    const teams = s.teams
    const complete = s.status === 'complete'
    // A pre_draft season has all-zero records. Including it would inflate every
    // owner's season count and make the regular-season leaders meaningless.
    const played = s.status !== 'pre_draft' && s.matchupWeekCount > 0

    const byPlace = (p) => teams.find((t) => t.finalPlace === p) ?? null
    const ranked = [...teams].sort(
      (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
    )

    // Highest / lowest single-week team score across the season.
    let best = null
    let worst = null
    for (const w of s.matchups ?? []) {
      for (const m of w.matchups) {
        for (const side of m.sides) {
          if (!side.points) continue
          const rec = {
            week: w.week,
            rosterId: side.rosterId,
            team: teams.find((t) => t.rosterId === side.rosterId)?.name ?? null,
            points: side.points,
          }
          if (!best || rec.points > best.points) best = rec
          if (!worst || rec.points < worst.points) worst = rec
        }
      }
    }

    const scored = teams.filter((t) => t.pointsFor > 0)
    const topScoring = scored.length
      ? scored.reduce((a, b) => (b.pointsFor > a.pointsFor ? b : a))
      : null
    const bottomScoring = scored.length
      ? scored.reduce((a, b) => (b.pointsFor < a.pointsFor ? b : a))
      : null

    seasonRecords.push({
      season: s.season,
      status: s.status,
      champion: complete ? byPlace(1) && summarize(byPlace(1)) : null,
      runnerUp: complete ? byPlace(2) && summarize(byPlace(2)) : null,
      thirdPlace: complete ? byPlace(3) && summarize(byPlace(3)) : null,
      lastPlace: complete ? byPlace(teams.length) && summarize(byPlace(teams.length)) : null,
      regularSeasonBest: played && ranked[0] ? summarize(ranked[0]) : null,
      regularSeasonWorst: played && ranked.at(-1) ? summarize(ranked.at(-1)) : null,
      topScoring: topScoring && summarize(topScoring),
      bottomScoring: bottomScoring && summarize(bottomScoring),
      highestWeek: best,
      lowestWeek: worst,
      finalStandings: complete
        ? [...teams]
            .filter((t) => t.finalPlace != null)
            .sort((a, b) => a.finalPlace - b.finalPlace)
            .map((t) => ({ place: t.finalPlace, ...summarize(t) }))
        : null,
    })

    // All-time rollup, keyed by owner so team renames don't fragment history.
    // `seasons` is iterated newest-first, so the FIRST time we see an owner is
    // their most recent name — that's the label we keep. Assigning on every
    // pass would leave the oldest name winning.
    for (const t of teams) {
      if (!t.ownerId) continue
      if (!allTime.has(t.ownerId)) {
        allTime.set(t.ownerId, {
          ownerId: t.ownerId,
          name: t.name,
          avatar: t.avatar,
          // Every alias this owner has used, newest first.
          aliases: [t.name],
          seasons: 0,
          wins: 0,
          losses: 0,
          ties: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          titles: 0,
          finals: 0,
          podiums: 0,
          lastPlaces: 0,
        })
      }
      const a = allTime.get(t.ownerId)
      if (!a.aliases.includes(t.name)) a.aliases.push(t.name)
      a.avatar ??= t.avatar
      if (!played) continue
      a.seasons++
      a.wins += t.wins
      a.losses += t.losses
      a.ties += t.ties
      a.pointsFor += t.pointsFor
      a.pointsAgainst += t.pointsAgainst
      if (complete) {
        if (t.finalPlace === 1) a.titles++
        if (t.finalPlace === 1 || t.finalPlace === 2) a.finals++
        if (t.finalPlace != null && t.finalPlace <= 3) a.podiums++
        if (t.finalPlace === teams.length) a.lastPlaces++
      }
    }
  }

  const allTimeList = [...allTime.values()]
    .map((a) => ({
      ...a,
      pointsFor: round2(a.pointsFor),
      pointsAgainst: round2(a.pointsAgainst),
      winPct: a.wins + a.losses + a.ties > 0
        ? round3((a.wins + a.ties * 0.5) / (a.wins + a.losses + a.ties))
        : 0,
    }))
    .sort((a, b) => b.titles - a.titles || b.winPct - a.winPct)

  return { seasons: seasonRecords, allTime: allTimeList }
}

const summarize = (t) => ({
  rosterId: t.rosterId,
  ownerId: t.ownerId,
  name: t.name,
  avatar: t.avatar,
  wins: t.wins,
  losses: t.losses,
  ties: t.ties,
  pointsFor: round2(t.pointsFor),
  pointsAgainst: round2(t.pointsAgainst),
})

const round2 = (n) => Math.round(n * 100) / 100
const round3 = (n) => Math.round(n * 1000) / 1000

// ---------------------------------------------------------------------------
// players
// ---------------------------------------------------------------------------

async function loadPlayerDump() {
  await mkdir(CACHE, { recursive: true })
  const cacheFile = join(CACHE, 'players-nfl.json')

  if (!FULL && existsSync(cacheFile)) {
    const age = Date.now() - (await stat(cacheFile)).mtimeMs
    if (age < PLAYER_CACHE_MAX_AGE_MS) {
      console.log(`  using cached player dump (${Math.round(age / 60000)}m old)`)
      return JSON.parse(await readFile(cacheFile, 'utf8'))
    }
  }

  console.log('  downloading players/nfl (~14.6MB)...')
  const res = await fetch(`${API}/v1/players/nfl`)
  requestCount++
  if (!res.ok) throw new Error(`players/nfl returned ${res.status}`)
  const text = await res.text()
  await writeFile(cacheFile, text)
  return JSON.parse(text)
}

const POS_OF_INTEREST = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])

/**
 * Score a raw Sleeper stat line with THIS league's scoring settings rather than
 * using their generic pts_ppr. The league runs 1.0 rec, 4pt pass TD and
 * 0.04/pass yard, which pts_ppr does not reflect. Keys in scoring_settings map
 * 1:1 onto keys in the stats payload, so this is a plain dot product.
 */
function scoreLine(stats, scoring) {
  if (!stats) return null
  let total = 0
  for (const [key, weight] of Object.entries(scoring)) {
    const v = stats[key]
    if (typeof v === 'number') total += v * weight
  }
  return Math.round(total * 100) / 100
}

/**
 * Season-long actuals and projections. Both endpoints are undocumented but have
 * been stable for years; a failure here degrades the Teams page rather than
 * failing the build.
 */
async function fetchPointsTables(currentSeason, previousSeason, scoring, referenced) {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
    .map((p) => `position[]=${p}`)
    .join('&')

  const grab = async (label, url) => {
    try {
      const res = await fetch(url)
      requestCount++
      if (!res.ok) throw new Error(`${res.status}`)
      return await res.json()
    } catch (err) {
      console.warn(`  ! ${label} unavailable (${err.message}) — page will degrade gracefully`)
      return null
    }
  }

  const [actualsRaw, projRaw] = await Promise.all([
    grab('season actuals', `${API}/v1/stats/nfl/regular/${previousSeason}`),
    grab(
      'season projections',
      `${API}/projections/nfl/${currentSeason}?season_type=regular&${positions}`
    ),
  ])

  const shape = (raw) => {
    if (!raw) return null
    const out = {}
    // /v1/stats returns an object keyed by player_id; /projections returns an
    // array of rows each carrying player_id. Handle both.
    const rows = Array.isArray(raw)
      ? raw.map((r) => [r.player_id, r.stats ?? r])
      : Object.entries(raw)
    for (const [id, stats] of rows) {
      if (!referenced.has(id)) continue
      const points = scoreLine(stats, scoring)
      if (points == null) continue
      out[id] = { pts: points, gp: stats.gp ?? stats.gms_active ?? null }
    }
    return out
  }

  return { actuals: shape(actualsRaw), projections: shape(projRaw) }
}

function slimPlayer(p) {
  return {
    id: p.player_id,
    name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || p.player_id,
    pos: p.position ?? null,
    team: p.team ?? null,
    num: p.number ?? null,
    age: p.age ?? null,
    exp: p.years_exp ?? null,
    college: p.college ?? null,
    ht: p.height ?? null,
    wt: p.weight ?? null,
    status: p.status ?? null,
    injury: p.injury_status ?? null,
    rank: p.search_rank ?? null,
    depth: p.depth_chart_order ?? null,
    rookieYear: p.metadata?.rookie_year ?? null,
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const started = Date.now()
  const config = JSON.parse(await readFile(join(ROOT, 'league.config.json'), 'utf8'))

  console.log('Sleeper data pipeline')
  console.log(`  league ${config.leagueId}`)

  // --- walk the league chain -----------------------------------------------
  const chain = []
  let cursor = config.leagueId
  while (cursor && cursor !== '0') {
    const raw = await fetchSeason(cursor)
    chain.push(raw)
    console.log(
      `  ${raw.season}  ${String(raw.league.status).padEnd(9)} ` +
        `${raw.matchupWeeks.length} matchup weeks, ` +
        `${raw.txWeeks.reduce((n, t) => n + t.entries.length, 0)} transactions`
    )
    cursor = raw.league.previous_league_id
  }

  const nflState = await api('/v1/state/nfl')

  // --- shape each season ---------------------------------------------------
  const referenced = new Set()
  const seasons = []
  const written = []

  for (const [chainIndex, raw] of chain.entries()) {
    const teams = shapeTeams(raw)
    const teamsByRoster = new Map(teams.map((t) => [t.rosterId, t]))

    const matchups = shapeMatchups(raw)
    const transactions = shapeTransactions(raw, teamsByRoster)

    for (const t of teams) {
      t.players.forEach((p) => referenced.add(p))
      t.starters.forEach((p) => referenced.add(p))
    }
    for (const tx of transactions) {
      Object.keys(tx.adds ?? {}).forEach((p) => referenced.add(p))
      Object.keys(tx.drops ?? {}).forEach((p) => referenced.add(p))
    }
    for (const w of matchups) {
      for (const m of w.matchups) {
        for (const s of m.sides) {
          s.starters.forEach((p) => referenced.add(p))
          Object.keys(s.playersPoints ?? {}).forEach((p) => referenced.add(p))
        }
      }
    }

    // Prior-season potential points, keyed by owner so a roster_id shuffle
    // between league instances can't misattribute it. `chain` runs newest-first,
    // so the next entry is the previous season.
    const prior = chain[chainIndex + 1]
    const priorMaxPoints = prior
      ? new Map(
          shapeTeams(prior)
            .filter((t) => t.ownerId)
            .map((t) => [t.ownerId, round2(t.potentialPoints)])
        )
      : null

    // Draft detail (current season's draft carries the board we care about).
    const primaryDraft = raw.drafts[0]
    let draft = null
    if (primaryDraft) {
      const [detail, picks, tradedPicks] = await Promise.all([
        api(`/v1/draft/${primaryDraft.draft_id}`),
        api(`/v1/draft/${primaryDraft.draft_id}/picks`),
        api(`/v1/draft/${primaryDraft.draft_id}/traded_picks`),
      ])
      draft = shapeDraft(detail, picks, tradedPicks, teamsByRoster, priorMaxPoints)
      ;(picks ?? []).forEach((p) => p.player_id && referenced.add(p.player_id))
    }

    const settings = raw.league.settings ?? {}
    const seasonDoc = {
      season: raw.season,
      leagueId: raw.leagueId,
      name: raw.league.name,
      status: raw.league.status,
      totalRosters: raw.league.total_rosters,
      rosterPositions: raw.league.roster_positions ?? [],
      scoringSettings: raw.league.scoring_settings ?? {},
      settings: {
        playoffTeams: settings.playoff_teams ?? null,
        playoffWeekStart: settings.playoff_week_start ?? null,
        waiverType: settings.waiver_type ?? null,
        waiverBudget: settings.waiver_budget ?? null,
        waiverDayOfWeek: settings.waiver_day_of_week ?? null,
        waiverClearDays: settings.waiver_clear_days ?? null,
        tradeDeadline: settings.trade_deadline ?? null,
        taxiSlots: settings.taxi_slots ?? null,
        reserveSlots: settings.reserve_slots ?? null,
        draftRounds: settings.draft_rounds ?? null,
      },
      teams,
      draft,
      winnersBracket: raw.winners,
      losersBracket: raw.losers,
      tradedPicks: raw.leagueTradedPicks,
    }

    written.push(await writeJson(`season/${raw.season}.json`, seasonDoc))
    written.push(await writeJson(`matchups/${raw.season}.json`, matchups))
    written.push(await writeJson(`transactions/${raw.season}.json`, transactions))

    seasons.push({
      season: raw.season,
      status: raw.league.status,
      teams,
      matchups,
      transactionCount: transactions.length,
      matchupWeekCount: matchups.length,
    })
  }

  // --- players -------------------------------------------------------------
  console.log('  building player index...')
  const dump = await loadPlayerDump()

  const rookieYear = nflState?.season ?? chain[0].season
  const rookies = []
  for (const p of Object.values(dump)) {
    if (!POS_OF_INTEREST.has(p.position)) continue
    const isRookie = p.metadata?.rookie_year === rookieYear || (p.years_exp === 0 && p.active)
    if (isRookie) {
      referenced.add(p.player_id)
      rookies.push(slimPlayer(p))
    }
  }

  const [trendAdd, trendDrop] = await Promise.all([
    api('/v1/players/nfl/trending/add?lookback_hours=24&limit=30'),
    api('/v1/players/nfl/trending/drop?lookback_hours=24&limit=30'),
  ])
  ;[...(trendAdd ?? []), ...(trendDrop ?? [])].forEach((t) => referenced.add(t.player_id))

  const players = {}
  for (const id of referenced) {
    const p = dump[id]
    if (p) players[id] = slimPlayer(p)
  }

  written.push(await writeJson('players.json', players))
  written.push(
    await writeJson('prospects.json', {
      season: rookieYear,
      note: 'Sleeper exposes no ADP or mock draft. This board is Sleeper\'s own search_rank, which is what their app sorts by. Unranked players sort last.',
      players: rookies.sort(
        (a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER)
      ),
    })
  )
  written.push(
    await writeJson('trending.json', {
      adds: (trendAdd ?? []).map((t) => ({ id: t.player_id, count: t.count })),
      drops: (trendDrop ?? []).map((t) => ({ id: t.player_id, count: t.count })),
    })
  )

  // --- season-long points --------------------------------------------------
  console.log('  scoring season actuals + projections...')
  const completed = chain.find((c) => c.league.status === 'complete')
  const { actuals, projections } = await fetchPointsTables(
    chain[0].season,
    completed?.season ?? nflState?.previous_season,
    chain[0].league.scoring_settings ?? {},
    referenced
  )
  written.push(
    await writeJson('points.json', {
      actualsSeason: completed?.season ?? null,
      projectionsSeason: chain[0].season,
      note: 'Scored with this league\'s own scoring_settings, not Sleeper\'s generic pts_ppr.',
      actuals: actuals ?? {},
      projections: projections ?? {},
    })
  )

  // --- weekly game log -----------------------------------------------------
  console.log('  fetching weekly game log (36 requests, ~70MB, pruned on write)...')
  const weekly = await fetchWeeklyPoints(
    chain[0].season,
    completed?.season ?? nflState?.previous_season,
    chain[0].league.scoring_settings ?? {},
    referenced
  )
  written.push(
    await writeJson('weekly.json', {
      projectionsSeason: chain[0].season,
      actualsSeason: completed?.season ?? null,
      players: weekly,
    })
  )

  // --- news ----------------------------------------------------------------
  console.log('  fetching news feeds...')
  const news = await fetchNews(config)
  written.push(
    await writeJson('news.json', { fetchedAt: new Date().toISOString(), items: news })
  )
  console.log(`    ${news.length} items from ${new Set(news.map((n) => n.source)).size} feeds`)

  // --- records -------------------------------------------------------------
  written.push(await writeJson('records.json', buildRecords(seasons)))

  // --- bylaws --------------------------------------------------------------
  const bylawsSrc = join(ROOT, config.bylaws.markdownPath)
  let bylaws = null
  if (existsSync(bylawsSrc)) {
    bylaws = {
      markdown: normalizeBylaws(
        await readFile(bylawsSrc, 'utf8'),
        config.bylaws.replacements ?? []
      ),
      sourceUrl: config.bylaws.sourceUrl,
    }
  } else {
    bylaws = {
      markdown: null,
      sourceUrl: config.bylaws.sourceUrl,
      missing: `Export the Google Doc to ${config.bylaws.markdownPath} (File > Download > Markdown).`,
    }
  }
  written.push(await writeJson('bylaws.json', bylaws))

  // --- manifest ------------------------------------------------------------
  const manifest = {
    generatedAt: new Date().toISOString(),
    leagueId: config.leagueId,
    siteName: config.siteName,
    siteTagline: config.siteTagline,
    nflState,
    currentSeason: chain[0].season,
    currentStatus: chain[0].league.status,
    draftConfig: config.draft,
    tankathon: config.tankathon,
    hiddenUserIds: config.teamOverrides?.hiddenUserIds ?? [],
    /**
     * Positions this league actually rosters, derived from roster_positions —
     * currently QB/RB/WR/TE, no K and no DEF. Every position filter in the UI
     * must read this rather than hardcoding a list, so the site stays correct
     * if the league ever adds them.
     */
    activePositions: [
      ...new Set(
        (chain[0].league.roster_positions ?? [])
          .flatMap((slot) =>
            slot === 'SUPER_FLEX'
              ? ['QB', 'RB', 'WR', 'TE']
              : slot === 'FLEX'
                ? ['RB', 'WR', 'TE']
                : [slot]
          )
          .filter((p) => POS_OF_INTEREST.has(p))
      ),
    ].sort((a, b) => ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].indexOf(a) - ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].indexOf(b)),
    seasons: seasons.map((s) => ({
      season: s.season,
      status: s.status,
      teamCount: s.teams.length,
      transactionCount: s.transactionCount,
      matchupWeekCount: s.matchupWeekCount,
      // The 2026 schedule is not published by Sleeper until the league leaves
      // pre-draft. The Schedules page uses this to pick a sensible default.
      hasSchedule: s.matchupWeekCount > 0,
    })),
  }
  written.push(await writeJson('index.json', manifest))

  // --- report --------------------------------------------------------------
  const total = written.reduce((n, w) => n + w.bytes, 0)
  console.log('\n  written:')
  for (const w of written.sort((a, b) => b.bytes - a.bytes)) {
    console.log(`    ${String(Math.round(w.bytes / 1024)).padStart(5)} KB  ${w.path}`)
  }
  console.log(
    `\n  ${written.length} files, ${Math.round(total / 1024)} KB total, ` +
      `${Object.keys(players).length} players indexed, ${rookies.length} rookies`
  )
  console.log(`  ${requestCount} API requests in ${((Date.now() - started) / 1000).toFixed(1)}s`)
}

main().catch((err) => {
  console.error('\nPipeline failed:', err.message)
  process.exitCode = 1
})
