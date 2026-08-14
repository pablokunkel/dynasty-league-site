# Dynasty — league site

Static site for Sleeper league `1318724589848653824`, built with Vite + React + TypeScript
and deployed to Cloudflare Workers. All Sleeper data is fetched at build time into
`public/data`, so the browser never calls the Sleeper API and the site cannot be
broken by Sleeper being slow or down.

> **Working on this?** Read [`CLAUDE.md`](CLAUDE.md) first. It carries the API
> gotchas that cost real time to establish, the code conventions, and the current
> roadmap.

```
scripts/fetch-sleeper.mjs   pipeline: Sleeper -> public/data/*.json
scripts/should-refresh.mjs  cadence gate for the refresh workflow
league.config.json          facts the Sleeper API does not expose (see below)
content/bylaws.md           bylaws export, rendered on /bylaws
src/routes/                 one file per page
src/lib/data.ts             per-season lazy loading + promise cache
src/theme.css               palette lifted from Sleeper's own stylesheet
```

## Quick start

```bash
npm install
```

```bash
npm run data && npm run dev
```

`npm run data` re-fetches everything (~280 requests, ~5s). It caches the 14.6MB
player dump in `.cache/` for 12 hours; `npm run data:full` forces a re-download.

## Deploying to Cloudflare Workers

Workers and Pages are one platform now — there is no separate Pages product, so
disregard older guidance that treats them as alternatives.

| Setting | Value |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node version | 22 |

`wrangler.jsonc` declares the SPA fallback via `assets.not_found_handling`, so
client-side routes like `/draft` resolve instead of 404ing.

Do **not** add a `public/_redirects` containing `/*  /index.html  200`. That is
the old Pages idiom and is now rejected at deploy time with *"Infinite loop
detected in this rule"*, because the rule would strip `/index` and re-match
itself. The asset upload still reports success before this fails — a successful
upload is not a successful deploy.

## Things the Sleeper API does not have

Three things on this site cannot come from the API. They live in
`league.config.json` and must be maintained by hand:

- **Draft start time.** `draft.start_time` is `null` on this league. The countdown
  reads `draft.startTime` from the config.
- **Draft location.** Sleeper has no venue field anywhere.
- **Bylaws.** Currently imported at `content/bylaws.md`. To update, re-export the
  Google Doc via *File → Download → Markdown (.md)*, overwrite that file, and
  re-run `npm run data`.

  Google Docs exports bold paragraphs as `**LABEL:**` rather than real markdown
  headings, which would leave the table of contents empty. The pipeline promotes
  all-caps bold labels to `##` — see `normalizeBylaws` in
  `scripts/fetch-sleeper.mjs`. If you switch the doc to real Heading styles, that
  transform becomes a no-op and can be deleted.

`startTime` must carry an explicit UTC offset. It is currently
`2026-08-15T21:00:00-04:00` — note that August is daylight saving time, so Eastern
is `-04:00`, not the `-05:00` that "EST" literally means. Getting this wrong makes
the countdown an hour off.

## Data refresh

`.github/workflows/refresh-data.yml` runs every 15 minutes.
`scripts/should-refresh.mjs` decides whether each tick does real work:

| League state | Cadence |
| --- | --- |
| Within 6h before / 12h after the configured draft start | every 15 min |
| `in_season` | every 30 min |
| Anything else | once daily, ~11:00 UTC |

The job only commits when `public/data` actually changed, so a no-op refresh does
not trigger a Cloudflare rebuild. The gate fails open — if the league lookup
errors, it refreshes anyway.

**Expectation setting for draft night:** GitHub's scheduler is best-effort and can
lag 5–15 minutes under load. Combined with the 15-minute cron and the Workers build,
the draft board here can be ~20 minutes behind. Sleeper's own app remains the live
source during the draft; this is a companion view, not a replacement. The planned
fix is a Cloudflare Worker caching proxy — see the live-data section of
[`CLAUDE.md`](CLAUDE.md).

### Actions minutes

The 15-minute cron means ~96 workflow runs/day. Even though the gate skips most of
them in seconds, **GitHub bills private repos per started minute**, so that is
~2,900 min/month against a 2,000-minute free allowance.

Pick one:

- **Make the repo public** — Actions minutes are unlimited and unbilled. The
  tradeoff is that league members' Sleeper display names become public.
- **Drop the cron to `*/30`** — ~1,440 min/month, inside the free tier.
- **Ship the Worker and drop the cron to hourly or daily** — the Worker handles
  live data, so frequent polling stops being necessary at all. This is the
  intended end state.

## Notable data behaviour

- **The 2026 schedule does not exist yet.** Sleeper does not generate regular-season
  matchups until a league leaves `pre_draft`. `/schedule` defaults to the most recent
  season that has one and explains the gap. It fills in automatically after the draft.
- **This is a linear draft, not a snake.** `reversal_round: 0`, so the round 1 order
  repeats identically in rounds 2 and 3.
- **19 of 36 picks in the 2026 draft have been traded**, plus 17 more for 2027. The
  draft board resolves current ownership and shows the original owner underneath.
- **Player points use this league's scoring**, not Sleeper's generic `pts_ppr` —
  the pipeline dots the raw stat lines against `scoring_settings` (1.0 rec, 4pt
  pass TD, 0.04/pass yard).
- **There is no ADP or mock draft endpoint.** The prospect board is Sleeper's own
  `search_rank`, which is what their app sorts by.
- **All-time records are keyed by Sleeper user id**, so a manager who renames their
  team keeps one row; previous names show as "aka".
- **Bracket placements are offset for the consolation bracket.** Sleeper numbers
  placement games within each bracket, so the losers bracket's `p:1` is really the
  7th-place game in a 6-team playoff.
- `rkeefe1108` has no roster in 2026 and is hidden from `/teams` via
  `teamOverrides.hiddenUserIds`.

## Bylaws vs. league settings

Every numeric rule in the bylaws was checked against the live league config.
All match except one:

| Rule | Bylaws | Sleeper |
| --- | --- | --- |
| Votes needed to veto a trade | 7 of the 10 uninvolved teams | `veto_votes_needed: 6` |

Everything else lines up: 3 non-snake rounds, $200 FAAB, 6 playoff teams from week
15, 9 starters, 4 taxi, 4 IR, and the full scoring table.

The 2026 draft order was also verified against the bylaws rule — ascending 2025
Max Points For — and matches on all 12 slots. `/draft` shows each slot's prior-season
Max PF underneath the team name so the ordering is self-evident.

## Payload sizes

Measured on the current league. Nothing is loaded that a page does not use.

| File | Size |
| --- | --- |
| `players.json` (shared) | 222 KB |
| `transactions/{season}.json` | 6–178 KB |
| `matchups/{season}.json` | 0–102 KB |
| `season/{season}.json` | 20–63 KB |
| everything | ~1.7 MB |

First load is roughly 90 KB gzipped: vendor chunk 74 KB (caches across deploys),
app shell 6 KB, CSS 6 KB, plus a 2–4 KB route chunk.
