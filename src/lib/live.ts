import { useEffect, useRef, useState } from 'react'
import type { Manifest, MatchupSide } from './types'

/**
 * Polling against the Worker proxy (see worker/index.js).
 *
 * Deliberately does NOT use `use()`/Suspense like the rest of lib/data.ts. Live
 * data is an enhancement layered over the committed static build: if the Worker
 * is unreachable the page must keep rendering yesterday's JSON, not suspend or
 * throw. So this is a plain hook that returns `null` until it has something and
 * silently keeps the last good value on error.
 */
export interface LiveState<T> {
  data: T | null
  /** Last successful fetch, ms epoch. Null until the first one lands. */
  updatedAt: number | null
  error: boolean
}

export function useLive<T>(url: string | null, intervalMs: number): LiveState<T> {
  const [state, setState] = useState<LiveState<T>>({
    data: null,
    updatedAt: null,
    error: false,
  })

  // Keep the latest interval without restarting the loop when it changes.
  const intervalRef = useRef(intervalMs)
  intervalRef.current = intervalMs

  useEffect(() => {
    if (!url) {
      setState({ data: null, updatedAt: null, error: false })
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      try {
        const res = await fetch(url, { headers: { accept: 'application/json' } })
        if (!res.ok) throw new Error(String(res.status))
        const body = (await res.json()) as T
        if (!cancelled) setState({ data: body, updatedAt: Date.now(), error: false })
      } catch {
        // Keep whatever we last had. A blip must not blank the page.
        if (!cancelled) setState((s) => ({ ...s, error: true }))
      }
      if (!cancelled) timer = setTimeout(tick, intervalRef.current)
    }

    void tick()

    // Pause while the tab is hidden — nobody is watching, and it keeps us well
    // inside the Workers free tier during a long draft.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !cancelled) {
        clearTimeout(timer)
        void tick()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [url])

  return state
}

/** Endpoint builders — these must match the allowlist in worker/index.js. */
export const liveDraftPicks = (draftId: string) => `/api/draft/${draftId}/picks`
export const liveMatchups = (leagueId: string, week: number) =>
  `/api/league/${leagueId}/matchups/${week}`

/** A Sleeper draft pick, as returned by /v1/draft/{id}/picks. */
export interface LivePick {
  round: number
  draft_slot: number
  pick_no: number
  player_id: string
  picked_by: string
  roster_id: number
}

/** One roster's row from /v1/league/{id}/matchups/{week}, as Sleeper sends it. */
export interface LiveMatchupRow {
  roster_id: number
  matchup_id: number | null
  points: number | null
  starters: (string | null)[] | null
  starters_points: number[] | null
  players_points: Record<string, number> | null
}

/**
 * Overlay live rows on a committed matchup week. Pairings come from the static
 * data — Sleeper fixes them when the schedule is published — so only the
 * scoring fields move. A roster the live payload doesn't mention keeps its
 * committed side untouched.
 */
export function mergeLiveMatchups(
  matchups: { sides: MatchupSide[] }[],
  rows: LiveMatchupRow[] | null
): { sides: MatchupSide[] }[] {
  if (!rows || rows.length === 0) return matchups
  const byRoster = new Map(rows.map((r) => [r.roster_id, r]))
  return matchups.map((m) => ({
    sides: m.sides.map((s) => {
      const r = byRoster.get(s.rosterId)
      if (!r) return s
      return {
        ...s,
        points: r.points ?? 0,
        starters: (r.starters ?? []).filter((p): p is string => Boolean(p) && p !== '0'),
        startersPoints: r.starters_points ?? [],
        playersPoints: r.players_points ?? {},
      }
    }),
  }))
}

/**
 * True only while `season`/`week` is the NFL week in progress — the one
 * window in which polling can change anything. Everywhere else the committed
 * JSON is final and the Worker is left alone.
 */
export function isLiveWeek(manifest: Manifest, season: string, week: number) {
  return (
    manifest.currentStatus === 'in_season' &&
    season === manifest.nflState.season &&
    week === manifest.nflState.display_week
  )
}

/** Sunday scoreboard cadence — matches the Worker's edge TTL for matchups. */
export const MATCHUP_POLL_MS = 45_000
