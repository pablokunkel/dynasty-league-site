/**
 * Live-data proxy for draft night and game days.
 *
 * The static build is refreshed by GitHub Actions, which lags ~20 minutes —
 * fine in the offseason, useless while picks are coming in. This Worker fronts
 * the same Sleeper endpoints with a short edge cache, cutting that to seconds.
 *
 * Deliberately NOT backed by KV: KV's free tier allows 1,000 writes/day and a
 * one-minute refresh needs 1,440. A caching proxy does the same job for free,
 * and with a 12-person league the origin load is irrelevant.
 *
 * Everything that is not /api/* is handed straight to the static assets, which
 * keeps `not_found_handling: single-page-application` working for client routes.
 */

const SLEEPER = 'https://api.sleeper.app'

/**
 * Strict allowlist. Without it this is an open proxy that would happily relay
 * anything to anywhere. Each entry maps a path we accept to the Sleeper path we
 * call and how long the edge may hold it.
 *
 * Sleeper ids are long numeric strings; weeks are 1-2 digits.
 */
const ROUTES = [
  {
    // Draft night. Picks land in bursts, so this is the tightest TTL.
    pattern: /^\/api\/draft\/(\d{6,25})\/picks$/,
    upstream: (m) => `/v1/draft/${m[1]}/picks`,
    ttl: 15,
  },
  {
    pattern: /^\/api\/draft\/(\d{6,25})$/,
    upstream: (m) => `/v1/draft/${m[1]}`,
    ttl: 30,
  },
  {
    // Sunday scoreboard. Sleeper itself only recomputes every ~30s.
    pattern: /^\/api\/league\/(\d{6,25})\/matchups\/(\d{1,2})$/,
    upstream: (m) => `/v1/league/${m[1]}/matchups/${m[2]}`,
    ttl: 45,
  },
  {
    pattern: /^\/api\/league\/(\d{6,25})\/transactions\/(\d{1,2})$/,
    upstream: (m) => `/v1/league/${m[1]}/transactions/${m[2]}`,
    ttl: 60,
  },
  {
    pattern: /^\/api\/league\/(\d{6,25})\/rosters$/,
    upstream: (m) => `/v1/league/${m[1]}/rosters`,
    ttl: 60,
  },
]

function json(body, status, ttl) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Browser holds it briefly; the edge holds it for the full TTL, so a room
      // full of people refreshing collapses onto one origin call.
      'cache-control': `public, max-age=${Math.max(5, Math.floor(ttl / 2))}`,
    },
  })
}

async function proxy(route, match) {
  const url = `${SLEEPER}${route.upstream(match)}`

  const res = await fetch(url, {
    headers: { accept: 'application/json' },
    // Cloudflare's edge cache for subrequests. cacheEverything is required
    // because Sleeper does not send cache headers of its own.
    cf: { cacheTtl: route.ttl, cacheEverything: true },
  })

  if (!res.ok) {
    // Surface the failure rather than caching it — the client falls back to the
    // committed static JSON, which is stale but correct.
    return json({ error: `upstream ${res.status}`, path: route.upstream(match) }, 502, 5)
  }

  const body = await res.json()
  return json(body, 200, route.ttl)
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (!url.pathname.startsWith('/api/')) {
      // Not ours — static assets, including the SPA fallback.
      return env.ASSETS.fetch(request)
    }

    if (request.method !== 'GET') {
      return json({ error: 'method not allowed' }, 405, 5)
    }

    for (const route of ROUTES) {
      const match = url.pathname.match(route.pattern)
      if (match) {
        try {
          return await proxy(route, match)
        } catch (err) {
          return json({ error: 'proxy failed', detail: String(err) }, 502, 5)
        }
      }
    }

    return json({ error: 'unknown endpoint', path: url.pathname }, 404, 5)
  },
}
