import Link from 'next/link'
import { Download } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBDT } from '@/lib/formatters/currency'

/**
 * Landscaping's small shared pieces — one look for sections, numbers, money,
 * filters and empty lists, sized for thumbs (40px+ tap targets).
 * Colours: red = owed / over, emerald = good, forest = actions.
 */

export const TAP = 'min-h-[40px]'

export function LsSection({ title, meta, action, csv, children, className, bodyClass }: {
  title: React.ReactNode; meta?: React.ReactNode; action?: React.ReactNode; csv?: string
  children: React.ReactNode; className?: string; bodyClass?: string
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm', className)}>
      <header className="flex items-center gap-x-3 border-b border-gray-100 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {meta && <p className="text-xs text-gray-500">{meta}</p>}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {csv && (
            <a href={`/api/landscaping/export?report=${csv}`} className={cn(TAP, 'inline-flex items-center gap-1 rounded-lg px-2 text-xs font-medium text-forest-700 hover:bg-forest-50')}>
              <Download size={13} /> CSV
            </a>
          )}
          {action}
        </div>
      </header>
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

export type Tone = 'neutral' | 'owed' | 'good' | 'bad' | 'warn'
const TONE: Record<Tone, string> = {
  neutral: 'text-gray-900', owed: 'text-red-600', bad: 'text-red-600', good: 'text-emerald-700', warn: 'text-amber-700',
}

export function StatTile({ label, value, tone = 'neutral', sub, href }: { label: string; value: React.ReactNode; tone?: Tone; sub?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={cn('mt-0.5 break-words text-lg font-bold leading-tight tabular-nums sm:text-2xl', TONE[tone])}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </>
  )
  const cls = 'block min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm sm:px-4 sm:py-3'
  return href ? <Link href={href} className={cn(cls, 'hover:border-forest-300')}>{body}</Link> : <div className={cls}>{body}</div>
}

/** Money with a consistent colour: owed red when above 0, profit/balance red when below 0. */
export function Money({ value, kind = 'plain', className }: { value: number; kind?: 'plain' | 'owed' | 'profit' | 'in' | 'out'; className?: string }) {
  const tone = kind === 'owed' ? (value > 0.005 ? 'text-red-600 font-semibold' : 'text-gray-500')
    : kind === 'profit' ? (value < 0 ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold')
    : kind === 'in' ? 'text-emerald-700' : kind === 'out' ? 'text-gray-900' : ''
  const signed = kind === 'in' || kind === 'out'
  return <span className={cn('tabular-nums', tone, className)}>{signed ? (kind === 'in' ? '+' : '−') : ''}{signed ? formatBDT(Math.abs(value)) : fmtTk(value)}</span>
}

export function FilterChips({ items, current }: { items: Array<{ key: string; label: string; href: string; count?: number }>; current: string }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {items.map((f) => (
        <Link key={f.key} href={f.href} className={cn(TAP,
          'inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-3.5 text-sm',
          current === f.key ? 'border-forest-500 bg-forest-50 font-medium text-forest-800' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50')}>
          {f.label}{f.count ? <span className="rounded-full bg-white/80 px-1.5 text-xs tabular-nums text-gray-500">{f.count}</span> : null}
        </Link>
      ))}
    </div>
  )
}

/** A Link that looks like Button (md), tall enough to tap. */
export function LinkButton({ href, children, variant = 'outline', className, external }: {
  href: string; children: React.ReactNode; variant?: 'primary' | 'outline'; className?: string; external?: boolean
}) {
  const cls = cn(TAP, 'inline-flex items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-medium transition-colors',
    variant === 'primary' ? 'bg-forest-700 text-white hover:bg-forest-800' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50', className)
  return external
    ? <a href={href} target="_blank" rel="noopener" className={cls}>{children}</a>
    : <Link href={href} className={cls}>{children}</Link>
}

/** A list row: content on the left, the amount in a fixed right column so amounts line up. */
export function ListRow({ href, children, amount, sub, action }: { href?: string; children: React.ReactNode; amount?: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode }) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">{children}</div>
      {(amount || sub) && (
        <div className="flex-shrink-0 text-right">
          {amount && <div className="text-sm font-semibold tabular-nums text-gray-900">{amount}</div>}
          {sub && <div className="text-xs text-gray-500">{sub}</div>}
        </div>
      )}
    </>
  )
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {href ? <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80">{inner}</Link> : inner}
      {action && <div className="flex-shrink-0">{action}</div>}
    </li>
  )
}

export function LsEmpty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">{hint}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  )
}

/** A coloured "what happens next" strip. */
export function NextStep({ tone = 'info', children, action }: { tone?: 'info' | 'warn' | 'good' | 'bad'; children: React.ReactNode; action?: React.ReactNode }) {
  const cls = { info: 'border-sky-200 bg-sky-50 text-sky-900', warn: 'border-amber-200 bg-amber-50 text-amber-900', good: 'border-emerald-200 bg-emerald-50 text-emerald-900', bad: 'border-red-200 bg-red-50 text-red-800' }[tone]
  return (
    <div className={cn('flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm', cls)}>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  )
}

/**
 * Bottom bar that stays in view on long forms. On a phone the buttons share
 * the width evenly (the last one is the main action); on a computer they sit
 * on the right. It sits above the phone's bottom tab bar.
 */
export function StickyActions({ children, note }: { children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-10 -mx-4 -mb-4 mt-4 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:-mb-5 sm:rounded-b-xl sm:px-5 lg:bottom-0">
      {note && <div className="mb-2 text-sm sm:hidden">{note}</div>}
      <div className="flex items-center gap-2 [&>*]:flex-1 sm:justify-end sm:[&>*]:flex-none">
        {note && <div className="mr-auto hidden text-sm sm:block sm:!flex-1">{note}</div>}
        {children}
      </div>
    </div>
  )
}

/** "23 Nov" (this year) or "23 Nov 2025" — never 2026-11-23 on screen. */
export function fmtDay(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'Asia/Dhaka' })
}

/** Money with the minus in front of the taka sign: −৳1,500 (not ৳-1,500). */
export function fmtTk(n: number): string {
  return n < -0.004 ? `−${formatBDT(Math.abs(n))}` : formatBDT(n)
}
