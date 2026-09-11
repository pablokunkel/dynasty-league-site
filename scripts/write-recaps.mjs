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
 * Prose comes from one of two writers:
 *
 *   claude    when ANTHROPIC_API_KEY is set: the numbers go to Claude with the
 *             league's voice from league.config.json, and it returns a
 *             headline, a summary and a blurb per game. A few cents a week.
 *   template  otherwise, or with --template: deterministic sentences built
 *             from the same numbers. Dry but never wrong, never breaks.
 *
 * A Claude failure of any kind (no key, network, refusal, malformed output)
 * falls back to the template writer, so the Tuesday run always produces a
 * recap.
 *
 * Usage:
 *   node scripts/write-recaps.mjs                 current season, all missing weeks
 *   node scripts/write-recaps.mjs --season 2025   backfill a past season
 *   node scripts/write-recaps.mjs --week 3        one week only
 *   node scripts/write-recaps.mjs --force         rewrite even if the file exists
 *   node scripts/write-recaps.mjs --template      skip Claude even if a key is set
 *   node scripts/write-recaps.mjs --dry-run       print, write nothing
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
  const parts = [`${w.name} ${verbFor(g.margin, seed)} ${l.name}, ${fmt(w.points)} to ${fmt(l.points)}.`]
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
  if (a.closest && a.closest.margin < 3) {
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

async function claudeText(stats, config) {
  // Lazy import: the SDK is a dev dependency and the template path must run
  // without it installed (the refresh workflow does not npm ci).
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic()
  const model = config.recaps?.model ?? 'claude-opus-5'

  const response = await client.messages.create({
    model,
    max_tokens: 4000,
    system: config.recaps?.voice ?? DEFAULT_VOICE,
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content:
          `Write the week ${stats.week} recap from this data. Return one blurb per game, keyed by index.\n\n` +
          JSON.stringify(claudePayload(stats, config)),
      },
    ],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error(`refused (${response.stop_details?.category ?? 'unspecified'})`)
  }
  const text = response.content.find((b) => b.type === 'text')?.text
  if (!text) throw new Error(`no text block (stop_reason ${response.stop_reason})`)
  const parsed = JSON.parse(text)

  const blurbs = stats.games.map((_, i) => parsed.games.find((g) => g.index === i)?.blurb ?? null)
  if (blurbs.some((b) => !b)) throw new Error('missing a game blurb')

  return {
    headline: parsed.headline,
    summary: parsed.summary,
    blurbs,
    model: response.model,
    usage: response.usage,
  }
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

  if (!DRY) {
    // Rebundle so public/data reflects the content directory immediately; the
    // pipeline does the same on its next run.
    const bundle = await bundleRecaps(ROOT, season)
    await mkdir(join(DATA, 'recaps'), { recursive: true })
    await writeFile(join(DATA, 'recaps', `${season}.json`), JSON.stringify(bundle))
    console.log(`  bundled ${bundle.length} recap${bundle.length === 1 ? '' : 's'} -> public/data/recaps/${season}.json`)
  }
  console.log(`  ${wrote} written`)
}

main().catch((err) => {
  console.error('\nRecap writer failed:', err.message)
  process.exitCode = 1
})
