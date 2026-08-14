import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'
import { useBylaws } from '../lib/data'
import { Card, EmptyState, PageHeader, SearchInput } from '../components/ui'

interface Heading {
  id: string
  text: string
  level: number
}

/** Stable, collision-free slug for a heading. */
function slugify(text: string, seen: Map<string, number>) {
  const base =
    text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'section'
  const n = seen.get(base) ?? 0
  seen.set(base, n + 1)
  return n === 0 ? base : `${base}-${n}`
}

export default function Bylaws() {
  const bylaws = useBylaws()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<string | null>(null)

  const { html, headings } = useMemo(() => {
    if (!bylaws.markdown) return { html: '', headings: [] as Heading[] }

    const seen = new Map<string, number>()
    const found: Heading[] = []

    const renderer = new marked.Renderer()
    renderer.heading = function ({ tokens, depth }) {
      const text = this.parser.parseInline(tokens)
      const plain = text.replace(/<[^>]*>/g, '')
      const id = slugify(plain, seen)
      if (depth <= 3) found.push({ id, text: plain, level: depth })
      return `<h${depth} id="${id}">${text}</h${depth}>`
    }

    const out = marked.parse(bylaws.markdown, {
      renderer,
      gfm: true,
      breaks: false,
      async: false,
    }) as string

    return { html: out, headings: found }
  }, [bylaws.markdown])

  // Highlight the heading currently in view.
  useEffect(() => {
    if (!headings.length) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-80px 0px -70% 0px' }
    )
    headings.forEach((h) => {
      const el = document.getElementById(h.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [headings])

  const filteredHeadings = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? headings.filter((h) => h.text.toLowerCase().includes(q)) : headings
  }, [headings, query])

  if (!bylaws.markdown) {
    return (
      <>
        <PageHeader title="Bylaws" />
        <EmptyState
          title="Bylaws not imported yet"
          detail={
            <div className="space-y-3 text-left">
              <p>{bylaws.missing}</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  Open the{' '}
                  <a
                    href={bylaws.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-teal hover:underline"
                  >
                    league bylaws doc
                  </a>
                </li>
                <li>
                  <strong className="text-ink-2">File → Download → Markdown (.md)</strong>
                </li>
                <li>
                  Save it as{' '}
                  <code className="rounded bg-sunken px-1 text-xs">content/bylaws.md</code> in the
                  repo
                </li>
                <li>
                  Re-run <code className="rounded bg-sunken px-1 text-xs">npm run data</code>
                </li>
              </ol>
            </div>
          }
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Bylaws"
        subtitle="League constitution"
        right={
          <a
            href={bylaws.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-ink-3 hover:border-teal hover:text-teal"
          >
            Source doc ↗
          </a>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Find a section" />
          </div>
          <nav className="max-h-[70vh] overflow-y-auto">
            {filteredHeadings.map((h) => (
              <a
                key={h.id}
                href={`#${h.id}`}
                className={`block border-l-2 py-1 text-[11px] leading-snug transition-colors ${
                  active === h.id
                    ? 'border-teal font-semibold text-teal'
                    : 'border-line text-ink-4 hover:text-ink-2'
                }`}
                style={{ paddingLeft: `${(h.level - 1) * 10 + 10}px` }}
              >
                {h.text}
              </a>
            ))}
            {filteredHeadings.length === 0 && (
              <div className="px-2 py-3 text-[11px] text-ink-5">No sections match.</div>
            )}
          </nav>
        </aside>

        <Card className="prose-bylaws min-w-0">
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </Card>
      </div>
    </>
  )
}
