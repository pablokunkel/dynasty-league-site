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
npm run data        # re-fetch Sleeper -> public/data (~320 requests, ~5s)
npm run data:full   # same, but force re-download the 14.6MB player dump
npm run recaps      # write missing weekly recaps -> content/recaps (see below)
npm run dev         # vite dev server on :5173, with /api proxied to Sleeper
npm run build       # tsc --noEmit && vite build  (CI runs this)
```

`npm run data` caches the player dump in `.cache/` for 12 hours. Always re-run it
after editing `league.config.json`, `content/bylaws.md` or anything under
`content/` — they all feed the pipeline.

## Layout

```
scripts/fetch-sleeper.mjs   the pipeline. Everything data-shaped lives here.
scripts/should-refresh.mjs  cadence gate for the refresh workflow
scripts/write-recaps.mjs    weekly recap writer (template or Claude), Tuesdays
scripts/lib/recap-stats.mjs recap arithmetic: optimal lineups, awards, standings
wrangler.jsonc              Cloudflare Workers config — SPA fallback + worker
worker/index.js             live-data proxy for draft night / game days
src/lib/live.ts             non-Suspense polling hook + live matchup merge
league.config.json          facts the Sleeper API does not expose, recap voice
content/bylaws.md           bylaws export, normalized by the pipeline
content/recaps/             one JSON per written week — permanent, hand-editable
content/predraft-ranks/     rookie board frozen before each draft, for /draft
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
- Colors come from `@theme` tokens in `theme.css`. Don't introduce raw hex in
  components.
- **Never name a colour token after a core Tailwind utility.** Tailwind v4
  generates a `text-<name>` utility for every `@theme` colour, so a token named
  `base` produced a `text-base` *colour* utility that collided with the built-in
  `text-base` font-size. Every `text-base` in the app silently painted its text
  `#18202f` — near-black on a card. The token is now `--color-surface`. Avoid
  `base`, `xs`, `sm`, `lg`, `xl`.
- **The palette is contrast-checked, don't regress it.** Sleeper's own muted
  greys (`#7988a1`, `#677897`) measure 3.37:1 and 2.89:1 on our card surface —
  under WCAG AA. `ink-4`, `ink-5`, `rose`, `indigo` and the position colours are
  deliberately lightened from Sleeper's values so every one clears 4.5:1 against
  `--color-card`, which is the worst case. All nine routes currently audit at
  **zero** failures; re-run the audit after palette or component changes.
- The pipeline degrades rather than fails: an unavailable undocumented endpoint
  logs a warning and the page shows `—`.

## Verifying changes

`npm run build` typechecks and builds — CI runs exactly this. For UI work, the
dev server plus the browser tools work well; note that screenshots may not be
available (the pane doesn't always composite), in which case
`get_page_text` / `read_page` are the fallback and are sufficient for correctness.

---

# Roadmap

QA feedback from the league owner, 2026-08-14. Everything below the "Shipped"
line is done; the open items are what's left.

## Open

- [ ] **Owner action: add `ANTHROPIC_API_KEY` as a GitHub Actions secret** to
      switch the weekly recaps from template prose to Claude-written. Without
      it the Tuesday workflow still runs and writes template recaps. Once the
      key is in, `workflow_dispatch` the recaps workflow with `force` to
      rewrite any template weeks (`--season 2025 --force` regenerates the
      backfilled 2025 set).
- [ ] **Check the Tuesday after week 1** (Sept 15, 2026) that
      `content/recaps/2026/week-01.json` landed and `/recaps` opens on it. The
      writer keys off `nflState.week` advancing; if Sleeper flips it later than
      10:00 UTC Tuesday, the Wednesday run catches it.
- [ ] **Per-player news feed on Teams.** Backlogged at the owner's request. No
      free per-player RSS source exists; the realistic approach is filtering a
      league-wide feed by player name, which is lossy and misses spelling
      variants. Confirm that's acceptable before building it.
- [ ] `www.dasdynasty.com` has no DNS record; only the bare domain resolves.
      Optional CNAME, owner's call.

## Known discrepancy — needs a league decision, not code

The bylaws say **7 of 10 uninvolved teams** are needed to veto a trade. Sleeper
is configured `veto_votes_needed: 6`.

---

## Shipped

**2026-09-11 session**
- [x] **Draft class recap** replaces the prospect board on `/draft` once the
      draft is `complete` (`components/DraftRecap.tsx`). Grades each pick
      against the rookie board frozen just before the first pick: the pipeline
      writes `content/predraft-ranks/{season}.json` on every run while the
      draft is `pre_draft` and never touches it afterwards. 2026's snapshot was
      recovered from git (`f4353f3`). "Board" is the player's position within
      the class, not raw `search_rank`. Sleeper's ranking is one-QB, so QB
      "reaches" in this superflex room are mostly format — the page says so.
      Draft capital becomes "draft hauls" (summed projections) after the draft.
- [x] **Live game-day scores** on Schedule and a new Home scoreboard. Both poll
      `/api/league/{id}/matchups/{week}` every 45s while the week on screen is
      the NFL week in progress (`isLiveWeek` in `lib/live.ts`) and overlay the
      rows on the committed matchups. Home reads a 5KB `scoreboard.json` (the
      current week only) rather than the season's matchup file. `LivePill` is
      the shared marker. Vite dev proxies `/api` to Sleeper so this can be
      exercised without `wrangler dev`.
- [x] **Weekly recaps tab** (`/recaps`) replaces Waiver. `write-recaps.mjs`
      runs from `.github/workflows/recaps.yml` Tue/Wed 10:00 UTC, writes one
      `content/recaps/{season}/week-NN.json` per completed week, never
      overwrites an existing one, and the pipeline bundles them into
      `public/data/recaps/{season}.json`. Prose is Claude-written when the
      `ANTHROPIC_API_KEY` secret exists (`claude-opus-5`, structured JSON
      output, voice in `league.config.json` → `recaps.voice`), template
      otherwise; any Claude failure falls back to template so Tuesday always
      produces something. The optimal-lineup math reproduces Sleeper's `ppts`
      to the cent for 11 of 12 teams over 2025 (the twelfth is 21.4 low —
      a dual-`fantasy_positions` player the slim index cannot see). 2025 is
      backfilled with template recaps so the page has content before week 1.
- [x] **FAAB moved to Transactions.** The budget grid and the trending
      free-agent list live there now; `/waiver` redirects to `/transactions`.
- [x] **Home standings season fix.** It keyed off "has a schedule", and
      Sleeper publishes the schedule weeks before kickoff, so Home was already
      showing twelve 0-0 rows and an all-zero tankathon. It now keys off
      `manifest.seasons[].hasGames` (any W/L/T or PF > 0) and stays on 2025
      until 2026 has points. Note: roster `fpts` does **not** update live —
      matchup points do — so this flips when Sleeper finalizes week 1.

**Global**
- [x] Collapsible left nav, persisted to `localStorage`.
- [x] K and DEF dropped everywhere. Fixed structurally: the pipeline derives
      `manifest.activePositions` from `roster_positions`, and every filter reads
      it. `POSITION_ORDER` is ordering-only and is no longer imported by any
      route. Kickers are also excluded from the prospect board itself, not just
      its filter chips.
- [x] Team names link to `/teams?team={rosterId}&season={season}` on every page,
      via the `TeamLink` primitive.
- [x] Player profile overlay (`PlayerProfile.tsx`), opened by `PlayerLink` from
      any page. Driven by a `?player=` search param rather than component state,
      so it is linkable, survives a refresh, and closes with browser back.
      Headshot, league-scored season totals, per-game average, and a weekly game
      log. The 123KB `weekly.json` is fetched only when a profile first opens.

**Home**
- [x] Four tiles replaced: top / bottom projected team, top projected player with
      their fantasy team, top projected rookie.
- [x] Free-agent / projected / drops sections replaced with a fantasy news feed
      from Rotowire + ESPN, fetched at build time (which sidesteps CORS).
- [x] Standings replace projections once games exist — `hasGames` in `Home.tsx`.

**Draft**
- [x] Mohegan Sun mark beside the venue, hand-traced to SVG from the supplied
      JPGs (`MoheganSunIcon`). Source JPGs are gitignored.
- [x] Run-of-show block removed, with the `agenda` config key and type.
- [x] Countdown + venue (`DraftLogistics`) render only while the draft is not
      `complete`. It used to be unconditional and counted *up* after the start
      time. Every draft-time surface is now self-retiring: the Home banner is
      gated on `pre_draft`, the nav day-pill hides once the time passes, and this
      hides on draft completion. **Next season:** update `draft.startTime` and
      `venue` in `league.config.json`; the new league starts `pre_draft`, so all
      three come back without code changes.

**Teams**
- [x] Compact card grid is the default for All-teams, so several rosters are
      comparable at once. `Compact`/`Detailed` toggle retains the old tables.
      Slot is signalled by a coloured dot plus weight plus ordering.

**Schedule**
- [x] Week default fixed. It now prefers `?week=`, then the live NFL week when
      viewing the live season, then **the last week containing a real matchup**.
      Note the subtlety: Sleeper emits a week 18 for every season here with 12
      single-sided entries and no points, so "last week with data" would land on
      a page of twelve byes. `playedWeeks` filters to weeks with a paired
      matchup — 2025 correctly opens on week 17.
- [x] Expandable per-matchup positional comparison, slot by slot, indexing
      `starters`/`startersPoints` against non-BN `rosterPositions`.
      `usePlayers()` is called inside the expanded panel behind its own Suspense
      boundary, so the 222KB player index stays off Schedule's first paint.

**Transactions / Waiver**
- [x] Position filters use `activePositions`; team and player linking throughout.
- [x] FAAB budget tile removed (duplicated the Budgets panel); grid rebalanced.

**Playoffs**
- [x] Podium expanded to five: champion, runner-up, third, regular-season
      winner, last place.

**Records**
- [x] Season filter defaulting to ALL, persisted to `?season=`. When filtered,
      the all-time table narrows to managers who played that season and says so
      explicitly, since the numbers shown remain career totals.
- [x] Grouped by `owner_id`, not team name — was already correct; prior names
      show as "aka".

**Bylaws**
- [x] First person replaced with "the commissioner" via
      `bylaws.replacements` in `league.config.json`, applied by the pipeline so
      a re-export does not undo it. The pipeline **warns** when a replacement
      matches nothing, so a reworded sentence surfaces instead of silently
      leaving "me" on the page.

**Standings and Tankathon (on Home, per the owner's preference over a new tab)**
- [x] `components/LeagueTables.tsx`. Standings carries Place / W / L / T / PF /
      PA / Diff / Max PF / Accuracy, with ★ on the most efficient manager.
      Place is grouped by win total, so a four-way tie all read the same number.
- [x] Tankathon projects next year's round 1 from ascending Max PF — the bylaws
      rule — and resolves traded picks to whoever actually holds them. Copy
      switches between "projection" and "final" on season status. Flavour text
      lives in `league.config.json` under `tankathon`.
- [x] Both key off the most recent season with games, so they show 2025 now and
      switch to 2026 automatically once it kicks off.
- [x] Week-level deep links on Schedule — the week now mirrors into `?week=`.

**Accessibility**
- [x] Palette contrast pass. 79 failures on Playoffs alone → **0 across all nine
      routes.** Root causes were Sleeper's muted greys being too dark on our card
      surface, and the `--color-base` / `text-base` utility collision. See
      Conventions.

**Pipeline correctness**
- [x] RSS dates: ESPN stamps every item `EST` year-round, so `Date.parse` read
      summer dates an hour into the future and every headline rendered "just
      now". `parseFeedDate` corrects standard-time abbreviations that fall
      inside US DST. Same daylight-saving trap as the draft time — worth
      remembering that this class of bug has now bitten twice.

---

# Live data during games and the draft

**Built.** `worker/index.js`, wired in `wrangler.jsonc`. Verified locally with
`npx wrangler dev` before shipping.

The static build is refreshed by GitHub Actions on a cron and lags ~20 minutes.
That is fine in the offseason and useless while picks are landing, so a Worker
fronts the same Sleeper endpoints with a short edge cache.

**KV was considered and rejected.** Its free tier allows 1,000 writes/day; a
one-minute refresh needs 1,440, so it would cost $5/mo to do what a caching
proxy does for free. KV earns its place when read volume is high enough that
origin hits hurt — with 12 users they never do.

## How it fits together

```
wrangler.jsonc
  main: worker/index.js
  assets.binding: ASSETS
  assets.run_worker_first: true
```

`run_worker_first` matters: without it, `not_found_handling:
single-page-application` answers `/api/*` with index.html and the Worker never
runs. Every request therefore enters the Worker, which handles `/api/*` itself
and delegates everything else to `env.ASSETS.fetch(request)` — which still
applies the SPA fallback. The extra CPU on asset requests is negligible.

## Endpoints

Strictly allowlisted in `ROUTES`. Without that this is an open proxy. Ids must
match `\d{6,25}` and weeks `\d{1,2}`; anything else 404s, non-GET 405s.

| Path | TTL | Used by |
| --- | --- | --- |
| `/api/draft/{id}/picks` | 15s | Draft board, draft night |
| `/api/draft/{id}` | 30s | draft status |
| `/api/league/{id}/matchups/{week}` | 45s | Schedule + Home scoreboard, game days |
| `/api/league/{id}/transactions/{week}` | 60s | — |
| `/api/league/{id}/rosters` | 60s | — |

Edge caching is `cf: { cacheTtl, cacheEverything: true }`. `cacheEverything` is
required because Sleeper sends no cache headers of its own. A room full of
people refreshing collapses onto one origin call per TTL.

## Client side

`src/lib/live.ts`. Deliberately **not** Suspense-based like the rest of
`lib/data.ts`: live data is an enhancement over the committed JSON, so if the
Worker is unreachable the page must keep rendering yesterday's data rather than
suspend or throw. `useLive` returns null until it has something, keeps the last
good value on error, and pauses polling while the tab is hidden.

`Draft.tsx` polls picks every 15s whenever the draft is not `complete`, merges
them over the static board by `round:slot`, and shows a LIVE pill. With the
Worker down, the board silently renders the committed data.

`Schedule.tsx` and the Home `Scoreboard` do the same for matchups, gated by
`isLiveWeek` — only the NFL week in progress, only in season, only the live
season. `mergeLiveMatchups` swaps scoring fields onto the committed sides and
leaves pairings alone. `npm run dev` proxies `/api/*` to Sleeper's `/v1/*` so
all of this can be watched locally without `wrangler dev`.

## Load

12 users polling every 15s for a four-hour draft is ~11.5k requests against a
100k/day free tier.

---

