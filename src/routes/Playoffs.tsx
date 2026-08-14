import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useManifest, useRecords, useSeason } from '../lib/data'
import type { BracketMatch, SeasonRecord, Team, TeamSummary } from '../lib/types'
import { ordinal, pts1, record } from '../lib/format'
import {
  Avatar,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  Select,
  TeamLink,
} from '../components/ui'

/**
 * The podium the league owner asked for: the three bracket places plus the
 * regular-season winner and the bottom of the final standings.
 */
const PODIUM: {
  key: keyof Pick<
    SeasonRecord,
    'champion' | 'runnerUp' | 'thirdPlace' | 'regularSeasonBest' | 'lastPlace'
  >
  label: string
  color: string
}[] = [
  { key: 'champion', label: 'Champion', color: 'var(--color-teal)' },
  { key: 'runnerUp', label: 'Runner-up', color: 'var(--color-blue)' },
  { key: 'thirdPlace', label: 'Third', color: 'var(--color-amber)' },
  { key: 'regularSeasonBest', label: 'Regular season', color: 'var(--color-indigo)' },
  { key: 'lastPlace', label: 'Last place', color: 'var(--color-rose)' },
]

function BracketSide({
  rosterId,
  teams,
  won,
  seedOf,
  season,
}: {
  rosterId: number | undefined
  teams: Map<number, Team>
  won: boolean
  seedOf: Map<number, number>
  season: string
}) {
  const team = rosterId != null ? teams.get(rosterId) : undefined
  return (
    <div
      className={`flex items-center gap-2 px-2.5 py-1.5 ${
        won ? 'bg-teal/[0.08]' : ''
      }`}
    >
      <span className="w-4 shrink-0 text-[10px] font-bold text-ink-5 tnum">
        {rosterId != null ? (seedOf.get(rosterId) ?? '') : ''}
      </span>
      {team ? (
        <TeamLink
          rosterId={team.rosterId}
          name={team.name}
          avatar={team.avatar}
          season={season}
          size={20}
          className={`min-w-0 flex-1 text-[11px] ${
            won ? 'font-bold text-ink' : 'text-ink-4'
          }`}
        />
      ) : (
        <span className="flex-1 text-[11px] text-ink-5">TBD</span>
      )}
      {won && <span className="shrink-0 text-[10px] font-bold text-teal">W</span>}
    </div>
  )
}

function Bracket({
  matches,
  teams,
  seedOf,
  season,
  title,
  emptyLabel,
  /**
   * Sleeper numbers placement games within their own bracket, so the
   * consolation bracket's `p:1` is really the 7th-place game in a 6-team
   * playoff. Shift the label by the size of the playoff field.
   */
  placeOffset = 0,
}: {
  matches: BracketMatch[]
  teams: Map<number, Team>
  seedOf: Map<number, number>
  season: string
  title: string
  emptyLabel: string
  placeOffset?: number
}) {
  const rounds = useMemo(() => {
    const byRound = new Map<number, BracketMatch[]>()
    for (const m of matches) {
      if (!byRound.has(m.r)) byRound.set(m.r, [])
      byRound.get(m.r)!.push(m)
    }
    return [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([r, ms]) => [r, ms.sort((a, b) => a.m - b.m)] as const)
  }, [matches])

  if (matches.length === 0) return <EmptyState title={emptyLabel} />

  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <div className="card overflow-x-auto p-3">
        <div className="flex min-w-max gap-3">
          {rounds.map(([r, ms]) => (
            <div key={r} className="w-[200px] shrink-0">
              <div className="eyebrow mb-2 px-1">Round {r}</div>
              <div className="space-y-2">
                {ms.map((m) => (
                  <div
                    key={m.m}
                    className="overflow-hidden rounded-lg border border-line bg-sunken"
                  >
                    {m.p != null && (
                      <div className="border-b border-line bg-card/60 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-ink-5">
                        {ordinal(m.p + placeOffset)} place game
                      </div>
                    )}
                    <BracketSide
                      rosterId={m.t1}
                      teams={teams}
                      won={m.w === m.t1}
                      seedOf={seedOf}
                      season={season}
                    />
                    <div className="border-t border-line/60" />
                    <BracketSide
                      rosterId={m.t2}
                      teams={teams}
                      won={m.w === m.t2}
                      seedOf={seedOf}
                      season={season}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export default function Playoffs() {
  const manifest = useManifest()
  const records = useRecords()
  const [params, setParams] = useSearchParams()

  // Default to the most recent season with a completed bracket.
  const defaultSeason =
    manifest.seasons.find((s) => s.status === 'complete')?.season ?? manifest.currentSeason
  const seasonParam = params.get('season') ?? defaultSeason
  const season = useSeason(seasonParam)

  const teams = useMemo(() => new Map(season.teams.map((t) => [t.rosterId, t])), [season.teams])

  /** Regular-season seeding, used to label bracket entrants. */
  const seedOf = useMemo(() => {
    const sorted = [...season.teams].sort(
      (a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor
    )
    return new Map(sorted.map((t, i) => [t.rosterId, i + 1]))
  }, [season.teams])

  const rec = records.seasons.find((s) => s.season === seasonParam)
  const isComplete = season.status === 'complete'

  return (
    <>
      <PageHeader
        title="Playoffs"
        subtitle={
          <>
            {seasonParam} ·{' '}
            {season.settings.playoffTeams ?? '?'}-team field
            {season.settings.playoffWeekStart
              ? `, starting week ${season.settings.playoffWeekStart}`
              : ''}
          </>
        }
        right={
          <Select
            label="Season"
            value={seasonParam}
            onChange={(v) => {
              const next = new URLSearchParams(params)
              next.set('season', v)
              setParams(next, { replace: true })
            }}
            options={manifest.seasons.map((s) => ({
              value: s.season,
              label: s.status === 'complete' ? s.season : `${s.season} (${s.status})`,
            }))}
          />
        }
      />

      {!isComplete && (
        <div className="mb-5 rounded-xl border border-line bg-card px-4 py-3 text-sm text-ink-4">
          The {seasonParam} season is <strong className="text-ink-2">{season.status}</strong>, so no
          bracket exists yet. Pick a completed season above.
        </div>
      )}

      {/* --------------------------------------------------------- podium */}
      {rec && isComplete && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {PODIUM.map(({ key, label, color }) => {
            const entry: TeamSummary | null = rec[key]
            if (!entry) return null
            return (
              <Card key={key} className="flex items-center gap-3">
                <Avatar src={entry.avatar} name={entry.name} size={44} />
                <div className="min-w-0">
                  <div
                    className="text-[10px] font-bold uppercase tracking-[0.4px]"
                    style={{ color }}
                  >
                    {label}
                  </div>
                  <TeamLink
                    rosterId={entry.rosterId}
                    name={entry.name}
                    season={seasonParam}
                    showAvatar={false}
                    className="max-w-full font-bold text-ink"
                  />
                  <div className="text-[11px] text-ink-5 tnum">
                    {record(entry.wins, entry.losses, entry.ties)} · {pts1(entry.pointsFor)} PF
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <div className="space-y-6">
        <Bracket
          matches={season.winnersBracket}
          teams={teams}
          seedOf={seedOf}
          season={seasonParam}
          title="Championship bracket"
          emptyLabel="No championship bracket for this season"
        />
        <Bracket
          matches={season.losersBracket}
          teams={teams}
          seedOf={seedOf}
          season={seasonParam}
          title="Consolation bracket"
          emptyLabel="No consolation bracket for this season"
          placeOffset={season.settings.playoffTeams ?? 6}
        />
      </div>

      {/* ------------------------------------------------ final standings */}
      {rec?.finalStandings && (
        <section className="mt-6">
          <SectionTitle right={<span className="text-[11px] text-ink-5">bracket-derived</span>}>
            Final standings
          </SectionTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rec.finalStandings.map((t) => (
              <div
                key={t.rosterId}
                className="card flex items-center gap-3 p-2.5"
                style={
                  t.place === 1
                    ? { borderColor: 'color-mix(in srgb, var(--color-teal) 45%, transparent)' }
                    : t.place === rec.finalStandings!.length
                      ? { borderColor: 'color-mix(in srgb, var(--color-rose) 40%, transparent)' }
                      : undefined
                }
              >
                <span
                  className="w-6 shrink-0 text-center text-sm font-extrabold tnum"
                  style={{
                    color:
                      t.place === 1
                        ? 'var(--color-teal)'
                        : t.place === rec.finalStandings!.length
                          ? 'var(--color-rose)'
                          : 'var(--color-ink-5)',
                  }}
                >
                  {t.place}
                </span>
                <TeamLink
                  rosterId={t.rosterId}
                  name={t.name}
                  avatar={t.avatar}
                  season={seasonParam}
                  size={26}
                  className="min-w-0 flex-1 text-xs font-medium text-ink-2"
                />
                <span className="shrink-0 text-[11px] text-ink-5 tnum">
                  {record(t.wins, t.losses, t.ties)}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-5">
            Places come from Sleeper's bracket placement games — winners bracket for 1–
            {season.settings.playoffTeams ?? 6}, consolation bracket for the rest.
          </p>
        </section>
      )}
    </>
  )
}
