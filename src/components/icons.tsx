/**
 * Inline icons in Sleeper's style: 1.75px strokes, rounded caps, 20px grid.
 * Kept local so the site ships no icon-font or SVG-sprite dependency.
 */
type IconProps = { className?: string }

const base = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const HomeIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 8.5 10 3l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1z" />
  </svg>
)

export const DraftIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="2.75" y="3.5" width="14.5" height="13" rx="1.5" />
    <path d="M2.75 7.5h14.5M7.5 7.5v9M12.5 7.5v9" />
  </svg>
)

export const TeamsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="7.5" cy="7" r="2.75" />
    <path d="M2.5 16.5c0-2.5 2.2-4.25 5-4.25s5 1.75 5 4.25" />
    <path d="M13.5 5.1a2.75 2.75 0 0 1 0 5.3M14.75 12.6c1.7.55 2.75 1.9 2.75 3.9" />
  </svg>
)

export const ScheduleIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="2.75" y="4" width="14.5" height="13" rx="1.75" />
    <path d="M2.75 8h14.5M6.5 2.5v3M13.5 2.5v3" />
  </svg>
)

export const TransactionsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 7h11l-2.75-3M17 13H6l2.75 3" />
  </svg>
)

export const WaiverIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M10 2.75 3 6v4.5c0 3.6 2.9 5.9 7 6.75 4.1-.85 7-3.15 7-6.75V6z" />
    <path d="M7.75 10 9.5 11.75l3-3.5" />
  </svg>
)

export const PlayoffsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M6.5 3h7v4.5a3.5 3.5 0 0 1-7 0z" />
    <path d="M6.5 4.25H4v1.5a2.5 2.5 0 0 0 2.5 2.5M13.5 4.25H16v1.5a2.5 2.5 0 0 1-2.5 2.5" />
    <path d="M10 11v3M7.25 17h5.5" />
  </svg>
)

export const RecordsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3.5 16.5V9M8.5 16.5V4M13.5 16.5v-5.5" />
    <path d="M2 16.5h16" />
  </svg>
)

export const BylawsIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4.5 3.5h7.5L15.5 7v9.5a1 1 0 0 1-1 1h-10a1 1 0 0 1-1-1v-12a1 1 0 0 1 1-1z" />
    <path d="M11.75 3.5V7h3.75M6.75 10.5h6.5M6.75 13.5h4.5" />
  </svg>
)

export const TrendUpIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 13.5 7.75 8.75l3 3L17 5.5" />
    <path d="M12.5 5.5H17v4.5" />
  </svg>
)

export const TrendDownIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M3 6.5 7.75 11.25l3-3L17 14.5" />
    <path d="M12.5 14.5H17V10" />
  </svg>
)

export const PinIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M10 17.5s5.5-5 5.5-9a5.5 5.5 0 1 0-11 0c0 4 5.5 9 5.5 9z" />
    <circle cx="10" cy="8.5" r="2" />
  </svg>
)

export const ClockIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="10" cy="10" r="7.25" />
    <path d="M10 5.75V10l2.75 2" />
  </svg>
)

/**
 * Mohegan Sun skyline — the draft venue.
 *
 * Hand-traced from the reference line-art renders into vector form, rather than
 * embedding the source JPGs. Those were ~300KB each with a baked-in background
 * that would not sit cleanly on the card or follow the theme. This inherits
 * currentColor, stays crisp at any size, and costs about a kilobyte.
 *
 * Simplified deliberately: at the ~40px it renders at, the distinctive
 * silhouette (leaning slab, tall block, twin peaks) is what reads. Fine
 * foreground detail from the reference would turn to mush.
 */
export const MoheganSunIcon = ({ className }: IconProps) => (
  <svg
    viewBox="0 0 60 44"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    role="img"
    aria-label="Mohegan Sun"
  >
    {/* leaning slab tower, left */}
    <path d="M12 13.5 L15.5 36" />
    <path d="M12 13.5 L26 17.2" />
    <path d="M17.6 15.9 L17.6 36" />
    {/* tall centre block */}
    <path d="M26 7 L34 7 L34 36" />
    <path d="M26 7 L26 36" />
    {/* peaked twin towers */}
    <path d="M34 11.8 L39 6 L42.6 10.6 L42.6 36" />
    <path d="M39 6 L39 36" />
    {/* thin tower, right */}
    <path d="M42.6 11.2 L45.2 11.2 L45.2 36" />
    {/* ground line and podium */}
    <path d="M2 36 L58 36" />
    <path d="M5 39.4 L19 38.6 L19 42.6 L5 42.6 Z" />
    <path d="M23 39.8 L41 39.8 L41 42.6" />
  </svg>
)
