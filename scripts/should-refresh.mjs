#!/usr/bin/env node
/**
 * Cadence gate for the refresh workflow.
 *
 * The workflow is scheduled every 15 minutes, but running the full pipeline
 * that often year-round burns Actions minutes for nothing — in the offseason
 * the payloads are identical for weeks at a time. This decides whether a given
 * tick should actually do the work.
 *
 *   draft window   (start - 6h .. start + 12h)  -> every tick (15 min)
 *   in_season                                    -> every 30 min
 *   anything else                                -> once a day, ~11:00 UTC
 *
 * Writes `run=true|false` to $GITHUB_OUTPUT. Fails open: if the league lookup
 * errors, we run, because a missed refresh is worse than a wasted minute.
 */

import { appendFile, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const DRAFT_WINDOW_BEFORE_MS = 6 * 60 * 60 * 1000
const DRAFT_WINDOW_AFTER_MS = 12 * 60 * 60 * 1000
const DAILY_HOUR_UTC = 11

async function decide() {
  const now = new Date()
  const config = JSON.parse(await readFile(join(ROOT, 'league.config.json'), 'utf8'))

  // Draft window takes priority over everything else.
  const draftStart = new Date(config.draft.startTime).getTime()
  if (Number.isFinite(draftStart)) {
    const from = draftStart - DRAFT_WINDOW_BEFORE_MS
    const to = draftStart + DRAFT_WINDOW_AFTER_MS
    if (now.getTime() >= from && now.getTime() <= to) {
      return { run: true, reason: 'inside draft window — refreshing every tick' }
    }
  }

  let status = 'unknown'
  try {
    const res = await fetch(`https://api.sleeper.app/v1/league/${config.leagueId}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    status = (await res.json()).status
  } catch (err) {
    return { run: true, reason: `league lookup failed (${err.message}) — failing open` }
  }

  if (status === 'in_season') {
    const half = now.getUTCMinutes() < 15 || (now.getUTCMinutes() >= 30 && now.getUTCMinutes() < 45)
    return half
      ? { run: true, reason: 'in_season — 30 minute cadence' }
      : { run: false, reason: 'in_season — between 30 minute ticks' }
  }

  const daily = now.getUTCHours() === DAILY_HOUR_UTC && now.getUTCMinutes() < 15
  return daily
    ? { run: true, reason: `status=${status} — daily refresh` }
    : { run: false, reason: `status=${status} — outside the daily window` }
}

const { run, reason } = await decide()
console.log(`${run ? 'RUN ' : 'SKIP'} — ${reason}`)

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `run=${run}\nreason=${reason}\n`)
}
