import { Link } from 'react-router-dom'
import type { LiveState } from '../lib/live'
import type { MatchupSide, Team } from '../lib/types'
import { pts } from '../lib/format'
import { Card, LivePill, SectionTitle, TeamLink } from './ui'

/**
 * Compact current-week scoreboard for Home. Static base comes from
 * scoreboard.json; the caller overlays live rows before passing `matchups`.
 * Each card links to the same week on Schedule, where lineups can be compared.
 */
export default function Scoreboard({
  season,
  week,
  matchups,
  teams,
  live,
  isPlayoffs,
}: {
  season: string
  week: number
  matchups: { sides: MatchupSide[] }[]
  teams: Team[]
  live: LiveState<unknown>
  isPlayoffs: boolean
}) {
  const byRoster = new Map(teams.map((t) => [t.rosterId, t]))
  const anyPoints = matchups.some((m) => m.sides.some((s) => s.points > 0))
  const href = `/schedule?season=${season}&week=${week}`

  return (
    <section>
      <SectionTitle
        right={
          <span className="flex items-center gap-3 text-[11px] text-ink-5">
            <LivePill updatedAt={live.updatedAt} every="45s" />
            {!anyPoints && <span>not started</span>}
            <Link to={href} className="font-semibold text-teal hover:underline">
              Schedule →
            </Link>
          </span>
        }
      >
        Week {week}
        {isPlayoffs && (
          <span className="ml-2 rounded bg-amber/15 px-1.5 py-0.5 text-[10px] font-bold text-amber">
            PLAYOFFS
          </span>
        )}
      </SectionTitle>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {matchups.map((m, i) => {
          const [a, b] = m.sides
          const played = m.sides.some((s) => s.points > 0)
          const leader =
            played && a && b ? (a.points > b.points ? a.rosterId : b.points > a.points ? b.rosterId : null) : null

          const row = (side: MatchupSide | undefined) => {
            if (!side) return <div className="px-3 py-2 text-xs text-ink-5">Bye</div>
            const team = byRoster.get(side.rosterId)
            const leads = leader === side.rosterId
            return (
              <div className="flex items-center gap-2 px-3 py-2">
                <TeamLink
                  rosterId={side.rosterId}
                  name={team?.name ?? `Roster ${side.rosterId}`}
                  season={season}
                  avatar={team?.avatar ?? null}
                  size={22}
                  className={`min-w-0 flex-1 text-xs ${
                    leads ? 'font-bold text-ink' : played ? 'text-ink-4' : 'font-medium text-ink-2'
                  }`}
                />
                <span
                  className={`shrink-0 text-xs tnum ${
                    leads ? 'font-bold text-teal' : played ? 'text-ink-4' : 'text-ink-5'
                  }`}
                >
                  {played ? pts(side.points) : '—'}
                </span>
              </div>
            )
          }

          return (
            <Card key={i} padded={false} className="overflow-hidden">
              {row(a)}
              <div className="border-t border-line/60" />
              {row(b)}
            </Card>
          )
        })}
      </div>
    </section>
  )
}
