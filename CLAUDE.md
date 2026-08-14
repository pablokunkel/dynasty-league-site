# CLAUDE.md

Agent-facing guide for this repo. `README.md` is the human-facing version; this
file is the one to read first in a new session.

## What this is

A static site for Sleeper dynasty league `1318724589848653824` — 12-team
superflex, running since 2021. Vite + React 19 + TypeScript + Tailwind v4,
deployed to Cloudflare Workers.

**All Sleeper data is fetched at build time into `public/data`.** The browser
never calls the Sleeper API. This is deliberate: the site cannot be broken by
Sleeper being slow, and there is no CORS or rate-limit surface to manage.

## Commands

```bash
npm run data        # re-fetch Sleeper -> public/data (~280 requests, ~5s)
npm run data:full   # same, but force re-download the 14.6MB player dump
npm run dev         # vite dev server on :5173
npm run build       # tsc --noEmit && vite build  (CI runs this)
```

`npm run data` caches the player dump in `.cache/` for 12 hours. Always re-run it
after editing `league.config.json` or `content/bylaws.md` — both feed the pipeline.

## Layout

```
scripts/fetch-sleeper.mjs   the pipeline. Everything data-shaped lives here.
scripts/should-refresh.mjs  cadence gate for the refresh workflow
wrangler.jsonc              Cloudflare Workers config — SPA fallback lives here
league.config.json          facts the Sleeper API does not expose
content/bylaws.md           bylaws export, normalized by the pipeline
src/lib/data.ts             promise-cached, per-season lazy loading
src/lib/types.ts            mirrors the pipeline's output — keep in sync
src/lib/format.ts           points/record/height formatters
src/theme.css               palette + .prose-bylaws
src/components/ui.tsx       shared primitives (Card, Th/Td, Avatar, Segmented…)
src/routes/*.tsx            one file per page, all lazy-loaded in App.tsx
```

## Hard-won facts about the Sleeper API

Verified 2026-08-14 by direct probing. Do not re-litigate these; they cost real
time to establish.

| Thing | Reality |
| --- | --- |
| `draft.start_time` | **`null`** on this league. Countdown comes from `league.config.json`. |
| Draft location | **No field exists anywhere.** Also config. |
| ADP / mock draft | **No endpoint.** GraphQL `get_adp` 400s. Prospect board uses `search_rank`. |
| 2026 matchups | **Empty** until the league leaves `pre_draft`. 2021–2025 all return 12/week. |
| `players/nfl` | **14.6MB.** Build-time only, pruned to referenced players (~1,065). |
| League history | Chains back via `previous_league_id` to 2021. Six seasons. |
| Brackets | Both winners and losers resolve for every completed season. |
| Projections | `projections/nfl/{season}` works (2.9MB). Undocumented but stable. |
| Weekly projections | `projections/nfl/{season}/{week}` works — **2MB per week**, prune hard. |
| Player images | `https://sleepercdn.com/content/nfl/players/{id}.jpg` — 200 OK. |
| Team logos | `https://sleepercdn.com/images/team_logos/nfl/{abbr}.png` — 200 OK. |

### Non-obvious semantics

- **This is a linear draft, not a snake.** `type: "linear"`, `reversal_round: 0`.
  Round 1 order repeats identically in rounds 2 and 3. `shapeDraft` handles both.
- **Bracket `p` is scoped to its own bracket.** The losers bracket's `p:1` is the
  7th-place game in a 6-team playoff, not 1st. The pipeline offsets by
  `playoff_teams` when computing final standings; `Playoffs.tsx` takes a
  `placeOffset` prop for the labels. Both must stay in sync.
- **`fpts` splits into integer + hundredths.** Use the `pts()` helper —
  `fpts: 1941, fpts_decimal: 98` is 1941.98.
- **`ppts` is "Max Points For"** — the optimal-lineup score. The bylaws use it to
  set draft order.
- **Points are scored against this league's `scoring_settings`**, not Sleeper's
  generic `pts_ppr`. See `scoreLine()` — it is a dot product of the stat line
  against the scoring table. The league runs 1.0 rec / 4pt pass TD / 0.04 pass yd,
  which `pts_ppr` does not reflect.
- **All-time records key on `owner_id`, not team name.** `chain` runs newest-first,
  so the *first* time an owner is seen is their current name — do not reassign the
  label on later passes or the oldest name wins. Prior names collect in `aliases`.
- **`pre_draft` seasons are excluded from all-time aggregates**, otherwise the
  empty 2026 rows inflate every manager's season count.
- **13 users, 12 rosters.** `rkeefe1108` (`737728125689044992`) has no roster and
  is hidden via `teamOverrides.hiddenUserIds`.

### League shape (drives UI decisions)

`roster_positions` is `QB, RB, RB, WR, WR, TE, FLEX, FLEX, SUPER_FLEX` + 12 BN.

**There are no kickers or defenses in this league.** Any K or DEF appearing in a
filter or list is a bug. Derive allowed positions from `rosterPositions` rather
than hardcoding, so this stays correct if the league changes.

## Deployment

Deploys to **Cloudflare Workers**. Workers and Pages have been merged — Pages is
no longer a separate product, so disregard any guidance (including model
knowledge) that frames this as a choice between the two. The build runs
`wrangler deploy` against `/workers/scripts/dynasty-league-site/versions`.

**SPA fallback is configured in `wrangler.jsonc` via
`assets.not_found_handling: "single-page-application"`.** Do not reintroduce
`public/_redirects` with `/*  /index.html  200` — that is the old Pages idiom and
is now rejected at deploy time with *"Infinite loop detected in this rule"*,
because the rule would strip `/index` and re-match itself.

This already cost one failed deploy. Note that the asset upload reports success
before the failure, so "Uploaded N files" in the log does not mean the deploy
worked.

## Conventions

- **Never load data a page doesn't use.** Season-scoped files are separate and
  lazy. `players.json` (222KB) is the only large shared load.
- `src/lib/data.ts` caches promises by path — identity must stay stable because
  React's `use()` re-reads the same promise every render.
- Routes are lazy-loaded in `App.tsx`. Keep it that way; it is why the app chunk
  is 6KB gzipped.
- Wide tables scroll inside `TableWrap`, never the page body.
- Tabular numbers get `className="tnum"`.
- Colors come from `@theme` tokens in `theme.css`, lifted from Sleeper's own
  stylesheet. Don't introduce raw hex in components.
- The pipeline degrades rather than fails: an unavailable undocumented endpoint
  logs a warning and the page shows `—`.

## Verifying changes

`npm run build` typechecks and builds — CI runs exactly this. For UI work, the
dev server plus the browser tools work well; note that screenshots may not be
available (the pane doesn't always composite), in which case
`get_page_text` / `read_page` are the fallback and are sufficient for correctness.

---

# Roadmap

Feedback from the league owner, 2026-08-14, not yet implemented.

## Global

- [ ] **Collapse button for the left nav.** Persist the state.
- [ ] **Drop K and DEF everywhere** — position filters on Draft, Teams,
      Transactions, Waiver. Derive from `rosterPositions`, don't hardcode.
- [ ] **Link team names to `/teams?team={rosterId}` on every page.** Currently only
      Home does this. Wanted on Schedule, Waiver, Playoffs, Records, Transactions.
- [ ] **Clickable player names opening a player profile.** Wanted on Draft, Teams,
      Waiver, Transactions. Contents: headshot
      (`sleepercdn.com/content/nfl/players/{id}.jpg`, confirmed working), season
      stats, and per-week projections for the current season.
      **Cost note:** `projections/nfl/{season}/{week}` is ~2MB/week raw, ~36MB for
      a season. Must prune to referenced players only and ship as one lazily
      fetched file (est. ~400KB) loaded when a profile first opens — never on
      initial page load.

## Home

- [ ] **Replace the four tiles**, which don't earn their space, with: top projected
      team, bottom projected team, top projected player (+ their fantasy team), top
      projected rookie.
- [ ] **Replace top free agents / top projected / trending drops** — they read
      oddly stacked together. Candidate: a fantasy news feed instead.
      **Verified working RSS sources** (fetch at build time in the pipeline, which
      sidesteps CORS entirely): ESPN NFL `https://www.espn.com/espn/rss/nfl/news`
      (12KB), Rotowire NFL `https://www.rotowire.com/rss/news.php?sport=NFL` (3KB),
      Yahoo NFL `https://sports.yahoo.com/nfl/rss.xml` (342KB). CBS and FantasyPros
      both fail — don't retry them.
- [x] Standings replacing projections once the season starts — **already built**,
      `hasGames` in `Home.tsx` swaps the whole table.
- [x] Team names link to the Teams tab.

## Draft

- [x] **Mohegan Sun mark next to the location name** — done. The supplied assets
      were ~300KB JPGs with a baked background, so they were hand-traced into
      `MoheganSunIcon` in `components/icons.tsx` (~1KB, inherits `currentColor`).
      The source JPGs are gitignored; adjust the path data if the silhouette
      needs work.
- [x] **Run-of-show block removed**, along with the `agenda` key in
      `league.config.json` and the `DraftConfig` type.
- [ ] Drop K from the prospect position filter (see Global).
- [ ] Clickable player names (see Global).

## Teams

- [ ] **Compact default view.** Current design is one big table per team; the goal
      is scanning several teams side by side to compare players by position.
- [ ] Clickable player names (see Global).
- [ ] Per-player news feed. **No free per-player RSS source exists** — the
      realistic approach is filtering a league-wide feed by player name, which is
      lossy. Confirm this is acceptable before building it.

## Schedule

- [ ] **Default to the most recent week with data, not week 1.** Current logic
      falls back to week 1 whenever the selected season isn't the live NFL season,
      so browsing 2025 opens on week 1 instead of week 18. This is a real bug.
- [ ] Team names link to Teams.
- [ ] **Expandable matchup rows** showing a positional comparison between the two
      lineups. `starters` + `startersPoints` are already in `matchups/{season}.json`
      and line up positionally with `rosterPositions`.

## Transactions

- [ ] Drop K/DEF from the position filter (see Global).

## Waiver

- [ ] **Remove the FAAB budget tile** (redundant with the Budgets panel). Keep the
      other three.
- [ ] Team and player linking (see Global).

## Playoffs

- [ ] **Expand the podium** from champion / runner-up / third to also include
      regular-season winner and last place.
- [ ] Team linking (see Global).

## Records

- [ ] **Season filter defaulting to ALL**, filterable to a single season.
- [ ] Team linking (see Global).
- [x] Grouped by actual owner, not team name — **already the case**, keyed on
      `owner_id` with prior names shown as "aka".

## Bylaws

- [ ] **Replace first person with "the commissioner".** The site owner is not the
      league admin, so "collected by me", "I will collect venmo dues", "Sleeper
      does not give me much control", "I will auto-veto" all need rewording.
      **Implement as a `bylaws.replacements` array in `league.config.json` applied
      by the pipeline**, not by editing `content/bylaws.md` — that file gets
      overwritten on the next Google Doc export.

## Known discrepancy

The bylaws say **7 of 10 uninvolved teams** are needed to veto a trade. Sleeper is
configured `veto_votes_needed: 6`. Unresolved — a league decision, not a bug to
fix in code.

---

# Live data during games and the draft

**Decision: use a Cloudflare Worker as a short-TTL caching proxy. Do not use KV.**

The current GH Actions pipeline lags ~20 minutes (best-effort cron + Workers build),
which is fine in the offseason and useless on draft night.

Considered:

1. **Worker as caching proxy — chosen.** A Worker route fetches Sleeper on demand
   with a 30–60s edge cache. Latency drops to ~1 minute. No write limits, no cron,
   very little machinery.
2. **Worker + KV + cron trigger — rejected.** KV's free tier allows **1,000 writes
   per day**; a 1-minute cadence is 1,440. It would need the $5/mo plan to do what
   the proxy does for free. KV earns its place when read volume is high enough that
   origin hits hurt — with 12 users, they never do.
3. **Tightening the Actions cron — rejected.** Still bounded by GitHub's
   best-effort scheduler and the Workers build. Can't get below ~10 minutes.

### Shape

Only genuinely live surfaces go through the Worker; everything else stays static.

| Surface | Source | Why |
| --- | --- | --- |
| Draft picks during the draft | Worker, 30s TTL | `/v1/draft/{id}/picks`, small and fast-changing |
| Matchup scores Thu–Sun | Worker, 60s TTL | `/v1/league/{id}/matchups/{week}`, ~9KB |
| Everything else | Static build | Doesn't change intra-day |

The Worker should return raw-ish Sleeper payloads and let the client join them
against the already-loaded `players.json`. Keeping the join client-side is what
keeps the Worker small enough to avoid needing KV at all.

Load estimate: 12 users polling every 30s for a 4-hour draft is ~5,800 requests,
against a 100k/day free tier.

The static pipeline stays the fallback — if the Worker is unreachable the page
should render committed data rather than error.
