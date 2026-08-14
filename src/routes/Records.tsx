import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRecords } from '../lib/data'
import type { SeasonRecord, TeamSummary, WeekRecord } from '../lib/types'
import { pct, pts, pts1, record } from '../lib/format'
import {
  Avatar,
  Card,
  PageHeader,
  SectionTitle,
  Segmented,
  Td,
  Th,
  TableWrap,
} from '../components/ui'

function Superlative({
  label,
  entry,
  detail,
  accent,
}: {
  label: string
  entry: TeamSummary | null
  detail?: string
  accent?: string
}) {
  if (!entry) return null
  return (
    <div className="flex items-center gap-2.5 py-2">
      <Avatar src={entry.avatar} name={entry.name} size={28} />
      <div className="min-w-0 flex-1">
        <div className="eyebrow" style={accent ? { color: accent } : undefined}>
          {label}
        </div>
        <div className="truncate text-sm font-semibold text-ink-2">{entry.name}</div>
      </div>
      <div className="shrink-0 text-right text-[11px] text-ink-5 tnum">{detail}</div>
    </div>
  )
}

function WeekLine({ label, rec, accent }: { label: string; rec: WeekRecord | null; accent: string }) {
  if (!rec) return null
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="eyebrow">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-xs text-ink-3">
        {rec.team} <span className="text-ink-5">wk {rec.week}</span>
      </span>
      <span className="shrink-0 text-sm font-bold tnum" style={{ color: accent }}>
        {pts(rec.points)}
      </span>
    </div>
  )
}

function SeasonCard({ s }: { s: SeasonRecord }) {
  if (s.status !== 'complete') {
    return (
      <Card>
        <div className="flex items-baseline justify-between">
          <h3 className="text-lg font-bold text-ink">{s.season}</h3>
          <span className="rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-bold text-amber">
            {s.status}
          </span>
        </div>
        <p className="mt-2 text-xs text-ink-5">
          Season not finished — no champion or superlatives yet.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-lg font-bold text-ink">{s.season}</h3>
        <Link
          to={`/playoffs?season=${s.season}`}
          className="text-[11px] font-semibold text-teal hover:underline"
        >
          Bracket →
        </Link>
      </div>

      <div className="divide-y divide-line/60">
        <Superlative
          label="Champion"
          entry={s.champion}
          accent="var(--color-teal)"
          detail={s.champion ? record(s.champion.wins, s.champion.losses, s.champion.ties) : ''}
        />
        <Superlative
          label="Runner-up"
          entry={s.runnerUp}
          accent="var(--color-blue)"
          detail={s.runnerUp ? record(s.runnerUp.wins, s.runnerUp.losses, s.runnerUp.ties) : ''}
        />
        <Superlative
          label="Last place"
          entry={s.lastPlace}
          accent="var(--color-rose)"
          detail={s.lastPlace ? record(s.lastPlace.wins, s.lastPlace.losses, s.lastPlace.ties) : ''}
        />
        <Superlative
          label="Best regular season"
          entry={s.regularSeasonBest}
          detail={
            s.regularSeasonBest
              ? record(s.regularSeasonBest.wins, s.regularSeasonBest.losses, s.regularSeasonBest.ties)
              : ''
          }
        />
        <Superlative
          label="Most points"
          entry={s.topScoring}
          detail={s.topScoring ? `${pts1(s.topScoring.pointsFor)} PF` : ''}
        />
        <Superlative
          label="Fewest points"
          entry={s.bottomScoring}
          detail={s.bottomScoring ? `${pts1(s.bottomScoring.pointsFor)} PF` : ''}
        />
      </div>

      <div className="mt-2 border-t border-line pt-2">
        <WeekLine label="Best week" rec={s.highestWeek} accent="var(--color-teal)" />
        <WeekLine label="Worst week" rec={s.lowestWeek} accent="var(--color-rose)" />
      </div>
    </Card>
  )
}

type SortKey = 'titles' | 'winPct' | 'wins' | 'pointsFor' | 'seasons'

export default function Records() {
  const records = useRecords()
  const [sort, setSort] = useState<SortKey>('titles')

  const allTime = [...records.allTime].sort((a, b) => {
    switch (sort) {
      case 'winPct':
        return b.winPct - a.winPct
      case 'wins':
        return b.wins - a.wins
      case 'pointsFor':
        return b.pointsFor - a.pointsFor
      case 'seasons':
        return b.seasons - a.seasons
      default:
        return b.titles - a.titles || b.winPct - a.winPct
    }
  })

  const completed = records.seasons.filter((s) => s.status === 'complete')

  // League-wide extremes across every completed season.
  const bestWeek = completed
    .map((s) => s.highestWeek)
    .filter((w): w is WeekRecord => !!w)
    .sort((a, b) => b.points - a.points)[0]
  const worstWeek = completed
    .map((s) => s.lowestWeek)
    .filter((w): w is WeekRecord => !!w)
    .sort((a, b) => a.points - b.points)[0]

  return (
    <>
      <PageHeader
        title="Records"
        subtitle={`${completed.length} completed seasons · ${records.allTime.length} managers all-time`}
      />

      {/* ------------------------------------------------------- all-time */}
      <section className="mb-8">
        <SectionTitle
          right={
            <Segmented
              size="sm"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'titles', label: 'Titles' },
                { value: 'winPct', label: 'Win %' },
                { value: 'wins', label: 'Wins' },
                { value: 'pointsFor', label: 'Points' },
                { value: 'seasons', label: 'Tenure' },
              ]}
            />
          }
        >
          All-time
        </SectionTitle>

        <TableWrap>
          <thead>
            <tr>
              <Th className="w-10" align="right">#</Th>
              <Th>Manager</Th>
              <Th align="right" className="w-16">Sns</Th>
              <Th align="right" className="w-24">Record</Th>
              <Th align="right" className="w-16">Win%</Th>
              <Th align="right" className="w-24">Points for</Th>
              <Th align="center" className="w-16">Titles</Th>
              <Th align="center" className="w-16">Finals</Th>
              <Th align="center" className="w-16">Podium</Th>
              <Th align="center" className="w-16">Last</Th>
            </tr>
          </thead>
          <tbody>
            {allTime.map((a, i) => (
              <tr
                key={a.ownerId}
                className={`border-t border-line/60 hover:bg-card-2/60 ${i % 2 ? 'bg-sunken/25' : ''}`}
              >
                <Td align="right" className="text-ink-5 tnum">{i + 1}</Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar src={a.avatar} name={a.name} size={26} />
                    <div className="min-w-0">
                      <div className="font-medium text-ink-2">{a.name}</div>
                      {a.aliases.length > 1 && (
                        <div
                          className="truncate text-[10px] text-ink-5"
                          title={a.aliases.slice(1).join(' · ')}
                        >
                          aka {a.aliases.slice(1).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>
                </Td>
                <Td align="right" className="text-ink-4 tnum">{a.seasons}</Td>
                <Td align="right" className="text-ink-3 tnum">
                  {record(a.wins, a.losses, a.ties)}
                </Td>
                <Td align="right" className="font-semibold text-ink-2 tnum">{pct(a.winPct)}</Td>
                <Td align="right" className="text-ink-4 tnum">{pts1(a.pointsFor)}</Td>
                <Td align="center" className="tnum">
                  {a.titles > 0 ? (
                    <span className="font-bold text-teal">{a.titles}</span>
                  ) : (
                    <span className="text-ink-5">—</span>
                  )}
                </Td>
                <Td align="center" className="tnum">
                  {a.finals > 0 ? (
                    <span className="text-blue">{a.finals}</span>
                  ) : (
                    <span className="text-ink-5">—</span>
                  )}
                </Td>
                <Td align="center" className="tnum">
                  {a.podiums > 0 ? (
                    <span className="text-amber">{a.podiums}</span>
                  ) : (
                    <span className="text-ink-5">—</span>
                  )}
                </Td>
                <Td align="center" className="tnum">
                  {a.lastPlaces > 0 ? (
                    <span className="font-bold text-rose">{a.lastPlaces}</span>
                  ) : (
                    <span className="text-ink-5">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
        <p className="mt-2 text-[11px] text-ink-5">
          Keyed by Sleeper user, so a manager who renamed their team keeps one row. Pre-draft
          seasons are excluded from tenure and win totals.
        </p>
      </section>

      {/* --------------------------------------------------- league extremes */}
      <section className="mb-8">
        <SectionTitle>League extremes</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {bestWeek && (
            <Card>
              <div className="eyebrow" style={{ color: 'var(--color-teal)' }}>
                Highest single week, all-time
              </div>
              <div className="mt-1 text-2xl font-extrabold text-teal tnum">
                {pts(bestWeek.points)}
              </div>
              <div className="mt-0.5 text-sm text-ink-3">
                {bestWeek.team}{' '}
                <span className="text-ink-5">
                  ·{' '}
                  {completed.find((s) => s.highestWeek === bestWeek)?.season} week {bestWeek.week}
                </span>
              </div>
            </Card>
          )}
          {worstWeek && (
            <Card>
              <div className="eyebrow" style={{ color: 'var(--color-rose)' }}>
                Lowest single week, all-time
              </div>
              <div className="mt-1 text-2xl font-extrabold text-rose tnum">
                {pts(worstWeek.points)}
              </div>
              <div className="mt-0.5 text-sm text-ink-3">
                {worstWeek.team}{' '}
                <span className="text-ink-5">
                  ·{' '}
                  {completed.find((s) => s.lowestWeek === worstWeek)?.season} week {worstWeek.week}
                </span>
              </div>
            </Card>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------ by season */}
      <section>
        <SectionTitle>Season by season</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {records.seasons.map((s) => (
            <SeasonCard key={s.season} s={s} />
          ))}
        </div>
      </section>
    </>
  )
}
