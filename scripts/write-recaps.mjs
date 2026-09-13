#!/usr/bin/env node
/**
 * Weekly recap writer.
 *
 * For every completed week that has no recap yet, compute the week's numbers
 * (scripts/lib/recap-stats.mjs), write the prose, and save the result to
 * content/recaps/{season}/week-NN.json. Those files are permanent and hand
 * editable — a re-run never overwrites one unless --force is given. The
 * pipeline bundles them into public/data/recaps/{season}.json for the site.
 *
 * Prose comes from one of three places:
 *
 *   template  the default, and what CI runs: deterministic sentences built
 *             from the numbers. Dry but never wrong, never breaks.
 *   chat      no API key needed. `--prompt` prints the exact prompt for a
 *             week; paste it into a Claude Code or claude.ai session, save
 *             the JSON it answers with, and `--apply` merges that prose into
 *             the week's file. This is the intended path for this league —
 *             the owner has Claude through a subscription, not the API.
 *   claude    only when ANTHROPIC_API_KEY happens to be set: the same prompt
 *             goes straight to the API. Kept in case a key ever exists; any
 *             failure (no key, network, refusal, malformed output) falls back
 *             to the template so the Tuesday run always produces a recap.
 *
 * Usage:
 *   node scripts/write-recaps.mjs                 current season, all missing weeks
 *   node scripts/write-recaps.mjs --season 2025   backfill a past season
 *   node scripts/write-recaps.mjs --week 3        one week only
 *   node scripts/write-recaps.mjs --force         rewrite even if the file exists
 *   node scripts/write-recaps.mjs --template      skip the API even if a key is set
 *   node scripts/write-recaps.mjs --dry-run       print, write nothing
 *
 *   node scripts/write-recaps.mjs --prompt --week 3          print the prompt for week 3
 *   node scripts/write-recaps.mjs --apply answer.json         merge a chat answer into
 *                                                             the week it names
 *
 * Runs in CI from .github/workflows/recaps.yml on Tuesday and Wednesday
 * mornings, after Monday night's scores are final.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  bundleRecaps,
  computeWeekRecap,
  recapFile,
  recapsDir,
  weekHasGames,
} from './lib/recap-stats.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'public', 'data')

/* -------------------------------------------------------------------- args */

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? null : args[i + 1]
}

const FORCE = flag('force')
const DRY = flag('dry-run')
const TEMPLATE_ONLY = flag('template')
const PROMPT = flag('prompt')
const APPLY = opt('apply')

/* ---------------------------------------------------------------- template */

/** Stable pick from a list so the same week always reads the same way. */
const pick = (list, seed) => list[Math.abs(seed) % list.length]

const fmt = (n) => n.toFixed(2)

function verbFor(margin, seed) {
  if (margin < 3) return pick(['edged', 'squeaked past', 'survived'], seed)
  if (margin < 15) return pick(['beat', 'got past', 'held off'], seed)
  if (margin < 40) return pick(['handled', 'took care of', 'took down'], seed)
  return pick(['ran away from', 'buried', 'rolled over'], seed)
}

function templateGame(g, seed) {
  const { winner: w, loser: l } = g
  if (g.tie) return `${w.name} and ${l.name} played to a ${fmt(w.points)} tie.`
  const stake = g.label ? ` in the ${g.label.toLowerCase()}` : ''
  const parts = [`${w.name} ${verbFor(g.margin, seed)} ${l.name}${stake}, ${fmt(w.points)} to ${fmt(l.points)}.`]
  if (g.label === 'Last place game') {
    parts.push(`That leaves ${l.name} in last place for the season.`)
  }
  if (w.topPlayer) parts.push(`${w.topPlayer.name} led the way with ${fmt(w.topPlayer.points)}.`)
  if (l.benchLeft >= 10 && l.bestBench) {
    const swing = l.benchLeft >= g.margin ? ' — enough to have flipped it' : ''
    parts.push(
      `${l.name} left ${fmt(l.benchLeft)} on the bench, ${l.bestBench.name}'s ${fmt(l.bestBench.points)} the biggest miss${swing}.`
    )
  } else if (l.topPlayer && l.topPlayer.points >= 20) {
    parts.push(`${l.topPlayer.name}'s ${fmt(l.topPlayer.points)} was not enough for ${l.name}.`)
  }
  return parts.join(' ')
}

function templateText(stats) {
  const { awards: a, week, isPlayoffs, games } = stats
  const seed = Number(stats.season) * 100 + week

  let headline
  const title = games.find((g) => g.label === 'Championship')
  if (title && !title.tie) {
    headline = `${title.winner.name} wins the ${stats.season} title`
  } else if (a.closest && a.closest.margin < 3) {
    headline = `${a.closest.winner.name} survives ${a.closest.loser.name} by ${fmt(a.closest.margin)}`
  } else if (a.blowout && a.blowout.margin >= 60) {
    headline = `${a.blowout.winner.name} runs ${a.blowout.loser.name} off the field`
  } else if (a.highScore) {
    headline = `${a.highScore.name} drops ${fmt(a.highScore.points)} in week ${week}`
  } else {
    headline = `Week ${week} recap`
  }

  const s = []
  if (isPlayoffs) s.push(`Week ${week} is a playoff week, so every game below is elimination football.`)
  if (a.highScore && a.lowScore) {
    s.push(
      `${a.highScore.name} posted the week's high score at ${fmt(a.highScore.points)}; ${a.lowScore.name} brought up the rear with ${fmt(a.lowScore.points)}.`
    )
  }
  if (a.closest) {
    s.push(
      `The closest game was ${a.closest.winner.name} over ${a.closest.loser.name} by ${fmt(a.closest.margin)}`
        + (a.blowout && a.blowout !== a.closest
          ? `, while ${a.blowout.winner.name} won the blowout by ${fmt(a.blowout.margin)}.`
          : '.')
    )
  }
  if (a.topPlayer) {
    s.push(`Player of the week: ${a.topPlayer.name}, ${fmt(a.topPlayer.points)} for ${a.topPlayer.team}.`)
  }
  if (a.benchBlunder && a.benchBlunder.left >= 10) {
    s.push(
      `Bench of the week goes to ${a.benchBlunder.name}, who left ${fmt(a.benchBlunder.left)} sitting`
        + (a.benchBlunder.player ? ` — ${a.benchBlunder.player.name} scored ${fmt(a.benchBlunder.player.points)} from the pine.` : '.')
    )
  }

  return {
    headline,
    summary: s.join(' '),
    blurbs: games.map((g, i) => templateGame(g, seed + i)),
  }
}

/* ------------------------------------------------------------------ claude */

const DEFAULT_VOICE =
  'You write the weekly recap for a 12-team superflex dynasty fantasy football league that has run since 2021. ' +
  'Tone: a sharp, funny league newsletter — playful, never cruel, no profanity. ' +
  'Use only the facts provided; do not invent injuries, trades, reasons or quotes. ' +
  'Refer to teams and players by the exact names given. Numbers must match the data. ' +
  'Blurbs are two sentences; the summary is four or five and should note standings movement when it matters.'

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Under 80 characters. Names a team or player.' },
    summary: { type: 'string', description: 'Four or five sentences on the week as a whole.' },
    games: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'Index into the games array you were given.' },
          blurb: { type: 'string', description: 'Two sentences on this game.' },
        },
        required: ['index', 'blurb'],
        additionalProperties: false,
      },
    },
  },
  required: ['headline', 'summary', 'games'],
  additionalProperties: false,
}

/** Strip the payload down to what the prose needs — no ids, no avatars. */
function claudePayload(stats, config) {
  const side = (s) => ({
    team: s.name,
    points: s.points,
    optimalLineup: s.optimal,
    pointsLeftOnBench: s.benchLeft,
    topStarter: s.topPlayer && { name: s.topPlayer.name, pos: s.topPlayer.pos, points: s.topPlayer.points },
    bestBenched: s.bestBench && { name: s.bestBench.name, pos: s.bestBench.pos, points: s.bestBench.points },
  })
  return {
    league: config.siteName,
    season: stats.season,
    week: stats.week,
    isPlayoffWeek: stats.isPlayoffs,
    games: stats.games.map((g, index) => ({
      index,
      whatWasAtStake: g.label ?? (stats.isPlayoffs ? 'playoff week' : 'regular season'),
      winner: side(g.winner),
      loser: side(g.loser),
      margin: g.margin,
      tie: g.tie,
    })),
    awards: stats.awards,
    standingsAfterThisWeek: stats.standings.map((r) => ({
      place: r.place,
      team: r.name,
      record: r.ties ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`,
      pointsFor: r.pointsFor,
      movedSinceLastWeek: r.movement,
    })),
  }
}

/** The prompt, identical whether it goes to the API or gets pasted into a chat. */
function buildPrompt(stats, config) {
  return {
    system: config.recaps?.voice ?? DEFAULT_VOICE,
    user:
      `Write the week ${stats.week} recap from this data. Return one blurb per game, keyed by index.\n\n` +
      JSON.stringify(claudePayload(stats, config)),
  }
}

/**
 * Take the prose out of a model answer — the structured-output object from the
 * API, or the same JSON pasted back from a chat — and line it up with the games.
 */
function proseFromAnswer(parsed, stats) {
  if (!parsed || typeof parsed.headline !== 'string' || typeof parsed.summary !== 'string') {
    throw new Error('answer needs string "headline" and "summary"')
  }
  const games = Array.isArray(parsed.games) ? parsed.games : []
  const blurbs = stats.games.map((_, i) => games.find((g) => g.index === i)?.blurb ?? null)
  if (blurbs.some((b) => typeof b !== 'string' || !b)) {
    throw new Error(`need a blurb for every game index 0-${stats.games.length - 1}`)
  }
  return { headline: parsed.headline, summary: parsed.summary, blurbs }
}

async function claudeText(stats, config) {
  // Lazy import: the SDK is a dev dependency and the template path must run
  // without it installed (the refresh workflow does not npm ci).
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()
  const model = config.recaps?.model ?? 'claude-opus-5'
  const prompt = buildPrompt(stats, config)

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: prompt.system,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    messages: [{ role: 'user', content: prompt.user }],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error(`refused (${response.stop_details?.category ?? 'unspecified'})`)
  }
  const text = response.content.find((b) => b.type === 'text')?.text
  if (!text) throw new Error(`no text block (stop_reason ${response.stop_reason})`)

  return {
    ...proseFromAnswer(JSON.parse(text), stats),
    model: response.model,
    usage: response.usage,
  }
}

/* -------------------------------------------------------------- chat path */

/**
 * Print the prompt for each target week so a chat session can write it. The
 * answer must be the JSON object described by OUTPUT_SCHEMA plus `season` and
 * `week`, saved to a file and fed back with --apply.
 */
function printPrompt(stats, config) {
  const { system, user } = buildPrompt(stats, config)
  console.log(`\n===== ${stats.season} week ${stats.week} — prompt =====`)
  console.log('\n--- system ---\n')
  console.log(system)
  console.log('\n--- user ---\n')
  console.log(user)
  console.log('\n--- answer format ---\n')
  console.log(
    'Reply with ONLY this JSON (no prose around it), then save it and run\n' +
      `  node scripts/write-recaps.mjs --apply <file>\n\n` +
      JSON.stringify(
        {
          season: stats.season,
          week: stats.week,
          headline: '...',
          summary: '...',
          games: stats.games.map((_, index) => ({ index, blurb: '...' })),
        },
        null,
        2
      )
  )
}

/**
 * Merge a chat-written answer into an existing week file. The numbers stay as
 * they were; only the words change. Author becomes "claude" with model "chat"
 * so the page says "Written by Claude" and the provenance is honest.
 */
async function applyAnswer(path, { season, manifest, seasonDoc, matchups, players }) {
  const answer = JSON.parse(await readFile(path, 'utf8'))
  const targetSeason = String(answer.season ?? season)
  const week = Number(answer.week ?? opt('week'))
  if (!week) throw new Error('--apply needs "week" in the answer or --week')
  if (targetSeason !== season) {
    throw new Error(`answer is for ${targetSeason}; re-run with --season ${targetSeason}`)
  }

  const file = recapFile(ROOT, season, week)
  let recap
  if (existsSync(file)) {
    recap = JSON.parse(await readFile(file, 'utf8'))
  } else {
    // No template run yet for this week — build the numbers now.
    const stats = computeWeekRecap({ season: seasonDoc, matchups, players, week })
    const t = templateText(stats)
    recap = {
      season: stats.season,
      week,
      generatedAt: new Date().toISOString(),
      author: 'template',
      model: null,
      isPlayoffs: stats.isPlayoffs,
      headline: t.headline,
      summary: t.summary,
      games: stats.games.map((g, i) => ({ ...g, blurb: t.blurbs[i] })),
      awards: stats.awards,
      standings: stats.standings,
    }
  }

  const prose = proseFromAnswer(answer, recap)
  recap.headline = prose.headline
  recap.summary = prose.summary
  recap.games = recap.games.map((g, i) => ({ ...g, blurb: prose.blurbs[i] }))
  recap.author = 'claude'
  recap.model = 'chat'
  recap.editedAt = new Date().toISOString()

  await mkdir(recapsDir(ROOT, season), { recursive: true })
  await writeFile(file, JSON.stringify(recap, null, 2) + '\n')
  console.log(`  week ${week}: applied chat prose — "${recap.headline}"`)
  void manifest
}

/* -------------------------------------------------------------------- main */

async function loadJson(rel) {
  return JSON.parse(await readFile(join(DATA, rel), 'utf8'))
}

/**
 * Weeks that are over. For the live season that is every week before the one
 * Sleeper says is current — its state flips on Tuesday morning, after Monday
 * night — provided the week actually has scores. A completed season is every
 * week with a game in it.
 */
function completedWeeks(seasonDoc, matchups, nflState) {
  const played = matchups.filter(weekHasGames).map((m) => m.week)
  if (seasonDoc.status === 'complete') return played
  if (seasonDoc.status !== 'in_season' || seasonDoc.season !== nflState?.season) return []
  return played.filter((w) => w < (nflState.week ?? 1))
}

async function main() {
  const config = JSON.parse(await readFile(join(ROOT, 'league.config.json'), 'utf8'))
  const manifest = await loadJson('index.json')

  const season = opt('season') ?? manifest.currentSeason
  const seasonDoc = await loadJson(`season/${season}.json`)
  const matchups = await loadJson(`matchups/${season}.json`)
  const players = await loadJson('players.json')

  const only = opt('week') ? Number(opt('week')) : null
  const done = completedWeeks(seasonDoc, matchups, manifest.nflState)

  if (APPLY) {
    await applyAnswer(APPLY, { season, manifest, seasonDoc, matchups, players })
    await rebundle(season)
    return
  }

  if (PROMPT) {
    // Prompts are for rewriting as much as for writing, so existing files
    // don't exclude a week here.
    const weeks = only ? done.filter((w) => w === only) : done
    if (weeks.length === 0) console.warn(`  ! no completed week to prompt for (${only ?? 'any'})`)
    for (const week of weeks) {
      printPrompt(computeWeekRecap({ season: seasonDoc, matchups, players, week }), config)
    }
    return
  }

  const targets = (only ? done.filter((w) => w === only) : done).filter(
    (w) => FORCE || !existsSync(recapFile(ROOT, season, w))
  )

  const useClaude = !TEMPLATE_ONLY && Boolean(process.env.ANTHROPIC_API_KEY)
  console.log(`Recaps — ${season}`)
  console.log(`  completed weeks: ${done.length ? done.join(', ') : 'none'}`)
  console.log(`  to write: ${targets.length ? targets.join(', ') : 'nothing'}`)
  console.log(`  writer: ${useClaude ? 'claude (falls back to template)' : 'template'}`)
  if (only && !done.includes(only)) {
    console.warn(`  ! week ${only} is not a completed week for ${season}`)
  }

  let wrote = 0
  for (const week of targets) {
    const stats = computeWeekRecap({ season: seasonDoc, matchups, players, week })

    let text
    let author = 'template'
    let model = null
    if (useClaude) {
      try {
        const out = await claudeText(stats, config)
        text = out
        author = 'claude'
        model = out.model
        console.log(
          `  week ${week}: claude ${out.model} — ${out.usage?.input_tokens ?? '?'} in / ${out.usage?.output_tokens ?? '?'} out`
        )
      } catch (err) {
        console.warn(`  ! week ${week}: claude failed (${err.message}) — using template`)
      }
    }
    if (!text) text = templateText(stats)

    const recap = {
      season: stats.season,
      week: stats.week,
      generatedAt: new Date().toISOString(),
      author,
      model,
      isPlayoffs: stats.isPlayoffs,
      headline: text.headline,
      summary: text.summary,
      games: stats.games.map((g, i) => ({ ...g, blurb: text.blurbs[i] })),
      awards: stats.awards,
      standings: stats.standings,
    }

    if (DRY) {
      console.log(`\n--- ${season} week ${week} (${author}) ---`)
      console.log(recap.headline)
      console.log(recap.summary)
      recap.games.forEach((g) => console.log(`  • ${g.blurb}`))
      continue
    }

    await mkdir(recapsDir(ROOT, season), { recursive: true })
    await writeFile(recapFile(ROOT, season, week), JSON.stringify(recap, null, 2) + '\n')
    wrote++
    console.log(`  week ${week}: wrote ${author} recap — "${recap.headline}"`)
  }

  if (!DRY) await rebundle(season)
  console.log(`  ${wrote} written`)
}

/**
 * Rebundle so public/data reflects the content directory immediately; the
 * pipeline does the same on its next run.
 */
async function rebundle(season) {
  const bundle = await bundleRecaps(ROOT, season)
  await mkdir(join(DATA, 'recaps'), { recursive: true })
  await writeFile(join(DATA, 'recaps', `${season}.json`), JSON.stringify(bundle))
  console.log(`  bundled ${bundle.length} recap${bundle.length === 1 ? '' : 's'} -> public/data/recaps/${season}.json`)
}

main().catch((err) => {
  console.error('\nRecap writer failed:', err.message)
  process.exitCode = 1
})
