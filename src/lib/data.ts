import { use } from 'react'
import type {
  BylawsDoc,
  Manifest,
  MatchupWeek,
  PlayerIndex,
  PointsDoc,
  ProspectsDoc,
  RecordsDoc,
  SeasonDoc,
  Transaction,
  TrendingDoc,
} from './types'

/**
 * Promise cache keyed by path. Identity must be stable across renders because
 * React's `use()` re-reads the same promise on every pass — a fresh promise per
 * render would suspend forever.
 */
const cache = new Map<string, Promise<unknown>>()

function load<T>(path: string): Promise<T> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${path}`).then((res) => {
      if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`)
      return res.json()
    })
    cache.set(path, p)
  }
  return p as Promise<T>
}

/*
 * Season-scoped files are fetched on demand so opening Transactions for 2026
 * never pulls 2021's 178KB log. Only the manifest and player index are shared.
 */
export const useManifest = () => use(load<Manifest>('index.json'))
export const usePlayers = () => use(load<PlayerIndex>('players.json'))
export const useRecords = () => use(load<RecordsDoc>('records.json'))
export const useProspects = () => use(load<ProspectsDoc>('prospects.json'))
export const useTrending = () => use(load<TrendingDoc>('trending.json'))
export const useBylaws = () => use(load<BylawsDoc>('bylaws.json'))
export const usePoints = () => use(load<PointsDoc>('points.json'))

export const useSeason = (season: string) => use(load<SeasonDoc>(`season/${season}.json`))
export const useMatchups = (season: string) => use(load<MatchupWeek[]>(`matchups/${season}.json`))
export const useTransactions = (season: string) =>
  use(load<Transaction[]>(`transactions/${season}.json`))

/** Warm the cache without suspending — used to prefetch on nav hover. */
export function prefetch(path: string) {
  void load(path)
}
