/** Fantasy points: always two decimals, never a bare integer. */
export const pts = (n: number | null | undefined) =>
  n == null ? '—' : n.toFixed(2)

/** Compact points for dense tables. */
export const pts1 = (n: number | null | undefined) =>
  n == null ? '—' : n.toFixed(1)

export const record = (w: number, l: number, t: number) =>
  t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`

export const pct = (n: number) => n.toFixed(3).replace(/^0/, '')

export const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

/** Sleeper stores height as total inches in a string. */
export const height = (h: string | null) => {
  if (!h) return null
  const inches = Number(h)
  if (!Number.isFinite(inches) || inches === 0) return h
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}

export const relativeTime = (ms: number) => {
  // Feed timestamps can land slightly in the future — clock skew, or a source
  // that mislabels its timezone. Clamp rather than rendering "in -3 minutes".
  const diff = Math.max(0, Date.now() - ms)
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export const dateTime = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

export const TRANSACTION_LABELS: Record<string, string> = {
  free_agent: 'Free agent',
  waiver: 'Waiver',
  trade: 'Trade',
  commissioner: 'Commissioner',
}

/**
 * Canonical position sort order. This is the ORDERING reference only — to
 * decide which positions a page should *offer*, read `manifest.activePositions`
 * (this league rosters no K and no DEF).
 */
export const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export const posRank = (pos: string | null) => {
  const i = POSITION_ORDER.indexOf(pos ?? '')
  return i === -1 ? POSITION_ORDER.length : i
}

/**
 * Roster slot labels come back with FLEX/SUPER_FLEX in caps and underscores.
 * Sleeper renders SUPER_FLEX as "SFLX".
 */
export const slotLabel = (slot: string) =>
  slot === 'SUPER_FLEX' ? 'SFLX' : slot === 'FLEX' ? 'FLX' : slot
