import type { ReactNode } from 'react'
import type { Player } from '../lib/types'
import { height } from '../lib/format'

/* ------------------------------------------------------------------ avatar */

export function Avatar({
  src,
  name,
  size = 32,
}: {
  src: string | null
  name: string
  size?: number
}) {
  const initials = name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

  if (!src) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-full bg-card-2 font-semibold text-ink-4"
        style={{ width: size, height: size, fontSize: size * 0.36 }}
      >
        {initials || '?'}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className="shrink-0 rounded-full bg-card-2 object-cover"
      style={{ width: size, height: size }}
    />
  )
}

/* ---------------------------------------------------------------- position */

const POS_COLOR: Record<string, string> = {
  QB: 'var(--color-pos-qb)',
  RB: 'var(--color-pos-rb)',
  WR: 'var(--color-pos-wr)',
  TE: 'var(--color-pos-te)',
  K: 'var(--color-pos-k)',
  DEF: 'var(--color-pos-def)',
}

export function PositionBadge({ pos, className = '' }: { pos: string | null; className?: string }) {
  const color = POS_COLOR[pos ?? ''] ?? 'var(--color-ink-5)'
  return (
    <span
      className={`inline-flex h-[18px] min-w-[30px] items-center justify-center rounded px-1 text-[10px] font-bold tracking-wide ${className}`}
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      {pos ?? '—'}
    </span>
  )
}

/** Player name + position badge + NFL team, the way Sleeper stacks them. */
export function PlayerCell({
  player,
  id,
  showMeta = true,
}: {
  player: Player | undefined
  id: string
  showMeta?: boolean
}) {
  if (!player) {
    return <span className="text-ink-5">Unknown player ({id})</span>
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <PositionBadge pos={player.pos} />
      <div className="min-w-0">
        <div className="truncate font-medium text-ink-2">{player.name}</div>
        {showMeta && (
          <div className="truncate text-[11px] text-ink-5">
            {[player.team ?? 'FA', player.num ? `#${player.num}` : null, player.college]
              .filter(Boolean)
              .join(' · ')}
          </div>
        )}
      </div>
      {player.injury && (
        <span className="ml-auto shrink-0 text-[10px] font-bold text-rose">{player.injury}</span>
      )}
    </div>
  )
}

export function PlayerMeta({ player }: { player: Player }) {
  const h = height(player.ht)
  return (
    <span className="text-ink-5">
      {[
        player.age ? `${player.age}y` : null,
        h && player.wt ? `${h}, ${player.wt}lb` : h,
        player.exp === 0 ? 'Rookie' : player.exp ? `${player.exp}y exp` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    </span>
  )
}

/* ------------------------------------------------------------------ layout */

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: ReactNode
  right?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-4">{subtitle}</div>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  )
}

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return <div className={`card ${padded ? 'p-4' : ''} ${className}`}>{children}</div>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="eyebrow">{children}</h2>
      {right}
    </div>
  )
}

export function StatTile({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  accent?: string
}) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div
        className="mt-1.5 text-xl font-bold tnum"
        style={{ color: accent ?? 'var(--color-ink)' }}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-xs text-ink-4">{sub}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ states */

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1 py-16 text-sm text-ink-4">
      <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-line border-t-teal" />
      {label}…
    </div>
  )
}

export function EmptyState({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-1.5 px-6 py-14 text-center">
      <div className="font-semibold text-ink-2">{title}</div>
      {detail && <div className="max-w-md text-sm text-ink-4">{detail}</div>}
    </div>
  )
}

/* ----------------------------------------------------------------- controls */

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={`rounded-[6px] font-semibold transition-colors ${
            size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
          } ${
            o.value === value
              ? 'bg-card-2 text-ink'
              : 'text-ink-4 hover:text-ink-2'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label?: string
}) {
  return (
    <label className="inline-flex items-center gap-2">
      {label && <span className="eyebrow">{label}</span>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-xs font-semibold text-ink-2 outline-none focus:border-teal"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-card text-ink-2">
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative">
      <svg
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-5"
      >
        <circle cx="9" cy="9" r="5.5" />
        <path d="m13.5 13.5 3 3" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line bg-sunken py-1.5 pl-8 pr-3 text-xs text-ink-2 placeholder:text-ink-5 outline-none focus:border-teal"
      />
    </div>
  )
}

/* ------------------------------------------------------------------- table */

export function Th({
  children,
  align = 'left',
  sortable,
  active,
  dir,
  onClick,
  className = '',
}: {
  children: ReactNode
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  active?: boolean
  dir?: 'asc' | 'desc'
  onClick?: () => void
  className?: string
}) {
  const alignCls =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return (
    <th
      className={`sticky top-0 z-10 whitespace-nowrap border-b border-line bg-card px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.4px] ${alignCls} ${
        sortable ? 'cursor-pointer select-none hover:text-ink-2' : ''
      } ${active ? 'text-teal' : 'text-ink-4'} ${className}`}
      onClick={onClick}
    >
      {children}
      {sortable && active && <span className="ml-1">{dir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  )
}

export function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  const alignCls =
    align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'
  return <td className={`px-3 py-2.5 ${alignCls} ${className}`}>{children}</td>
}

/** Horizontal scroll container so wide tables never scroll the page body. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="card overflow-x-auto" >
      <table className="w-full min-w-max border-collapse text-sm">{children}</table>
    </div>
  )
}
