/** Shapes emitted by scripts/fetch-sleeper.mjs. Keep in sync with that file. */

export interface NflState {
  week: number
  season: string
  season_type: string
  display_week: number
  previous_season: string
  season_start_date: string
}

export interface Venue {
  name: string
  addressLine: string
  city: string
  region: string
  mapsQuery: string
  notes: string
}

export interface DraftConfig {
  confirmed: boolean
  startTime: string
  timezoneLabel: string
  rounds: number
  type: string
  typeNote: string
  venue: Venue
}

export interface SeasonSummary {
  season: string
  status: string
  teamCount: number
  transactionCount: number
  matchupWeekCount: number
  hasSchedule: boolean
}

export interface Manifest {
  generatedAt: string
  leagueId: string
  siteName: string
  siteTagline: string
  nflState: NflState
  currentSeason: string
  currentStatus: string
  draftConfig: DraftConfig
  tankathon: { title: string; subtitle: string; prospect: string }
  hiddenUserIds: string[]
  /**
   * Positions this league actually rosters — QB/RB/WR/TE, no K or DEF.
   * Every position filter must read this instead of hardcoding a list.
   */
  activePositions: string[]
  seasons: SeasonSummary[]
}

export interface NewsItem {
  source: string
  title: string
  link: string
  description: string | null
  published: number | null
}

export interface NewsDoc {
  fetchedAt: string
  items: NewsItem[]
}

/** Per-week points keyed by player, then by week number. */
export interface WeeklyDoc {
  projectionsSeason: string
  actualsSeason: string | null
  players: Record<
    string,
    { proj: Record<string, number>; act: Record<string, number> }
  >
}

export interface Team {
  rosterId: number
  ownerId: string | null
  name: string
  handle: string | null
  avatar: string | null
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  potentialPoints: number
  waiverBudgetUsed: number
  waiverPosition: number | null
  totalMoves: number
  players: string[]
  starters: string[]
  taxi: string[]
  reserve: string[]
  finalPlace: number | null
}

export interface DraftPick {
  round: number
  slot: number
  overall: number
  label: string
  originalRosterId: number
  originalTeam: string | null
  currentRosterId: number
  currentTeam: string | null
  wasTraded: boolean
  playerId: string | null
  /** Prior-season Max Points For, which the bylaws use to set the order. */
  priorMaxPoints: number | null
}

export interface Draft {
  draftId: string
  status: string
  type: string
  rounds: number
  teamCount: number
  startTime: number | null
  scoringType: string | null
  board: { round: number; picks: DraftPick[] }[]
  madePickCount: number
}

export interface BracketMatch {
  m: number
  r: number
  p?: number
  t1?: number
  t2?: number
  w?: number
  l?: number
  t1_from?: { w?: number; l?: number }
  t2_from?: { w?: number; l?: number }
}

export interface SeasonDoc {
  season: string
  leagueId: string
  name: string
  status: string
  totalRosters: number
  rosterPositions: string[]
  scoringSettings: Record<string, number>
  settings: {
    playoffTeams: number | null
    playoffWeekStart: number | null
    waiverType: number | null
    waiverBudget: number | null
    waiverDayOfWeek: number | null
    waiverClearDays: number | null
    tradeDeadline: number | null
    taxiSlots: number | null
    reserveSlots: number | null
    draftRounds: number | null
  }
  teams: Team[]
  draft: Draft | null
  winnersBracket: BracketMatch[]
  losersBracket: BracketMatch[]
  tradedPicks: {
    season: string
    round: number
    roster_id: number
    owner_id: number
    previous_owner_id: number
  }[]
}

export interface Player {
  id: string
  name: string
  pos: string | null
  team: string | null
  num: number | null
  age: number | null
  exp: number | null
  college: string | null
  ht: string | null
  wt: string | null
  status: string | null
  injury: string | null
  rank: number | null
  depth: number | null
  rookieYear: string | null
}

export type PlayerIndex = Record<string, Player>

export interface Transaction {
  id: string
  week: number
  season: string
  type: 'free_agent' | 'waiver' | 'trade' | 'commissioner' | string
  status: string
  created: number
  rosterIds: number[]
  teams: string[]
  adds: Record<string, number> | null
  drops: Record<string, number> | null
  draftPicks: {
    season: string
    round: number
    roster_id: number
    owner_id: number
    previous_owner_id: number
  }[]
  faab: number | null
  budgetMoves: { sender: number; receiver: number; amount: number }[]
}

export interface MatchupSide {
  rosterId: number
  points: number
  starters: string[]
  startersPoints: number[]
  playersPoints: Record<string, number>
}

export interface MatchupWeek {
  week: number
  matchups: { sides: MatchupSide[] }[]
}

export interface TeamSummary {
  rosterId: number
  ownerId: string | null
  name: string
  avatar: string | null
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
}

export interface WeekRecord {
  week: number
  rosterId: number
  team: string | null
  points: number
}

export interface SeasonRecord {
  season: string
  status: string
  champion: TeamSummary | null
  runnerUp: TeamSummary | null
  thirdPlace: TeamSummary | null
  lastPlace: TeamSummary | null
  regularSeasonBest: TeamSummary | null
  regularSeasonWorst: TeamSummary | null
  topScoring: TeamSummary | null
  bottomScoring: TeamSummary | null
  highestWeek: WeekRecord | null
  lowestWeek: WeekRecord | null
  finalStandings: (TeamSummary & { place: number })[] | null
}

export interface AllTimeEntry {
  ownerId: string
  name: string
  avatar: string | null
  aliases: string[]
  seasons: number
  wins: number
  losses: number
  ties: number
  pointsFor: number
  pointsAgainst: number
  titles: number
  finals: number
  podiums: number
  lastPlaces: number
  winPct: number
}

export interface RecordsDoc {
  seasons: SeasonRecord[]
  allTime: AllTimeEntry[]
}

export interface ProspectsDoc {
  season: string
  note: string
  players: Player[]
}

export interface TrendingDoc {
  adds: { id: string; count: number }[]
  drops: { id: string; count: number }[]
}

export interface PointsEntry {
  pts: number
  gp: number | null
}

export interface PointsDoc {
  actualsSeason: string | null
  projectionsSeason: string
  note: string
  actuals: Record<string, PointsEntry>
  projections: Record<string, PointsEntry>
}

export interface BylawsDoc {
  markdown: string | null
  sourceUrl: string
  missing?: string
}
