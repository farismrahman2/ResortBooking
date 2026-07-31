'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * One list component that renders a real table on desktop and tappable cards
 * on phones.
 *
 * Why this exists: 69 files in this app hand-rolled a <table> and only 2 had
 * any mobile fallback. On the 375px Android screens most staff actually use,
 * every list was a horizontal-scroll pan — the guest name scrolled out of view
 * before the amount scrolled in.
 *
 * Columns declare their role in the mobile card via `card`:
 *   'title'    — the headline (one per column set)
 *   'subtitle' — secondary line under the title
 *   'badge'    — right-aligned on the title row (status chips)
 *   'meta'     — chips on the footer row
 *   'hidden'   — desktop-only; dropped from the card entirely
 * Anything left as undefined renders as a label/value pair in the card body.
 */

export interface DataColumn<T> {
  key:      string
  header:   string
  render:   (row: T) => React.ReactNode
  align?:   'left' | 'right' | 'center'
  /** Role this column plays in the mobile card. */
  card?:    'title' | 'subtitle' | 'badge' | 'meta' | 'hidden'
  /** Extra classes for the desktop <td>. */
  className?: string
  /** Hide the label in the card body (for self-describing values). */
  hideLabel?: boolean
}

interface Props<T> {
  rows:     T[]
  columns:  DataColumn<T>[]
  rowKey:   (row: T) => string
  /** Makes rows tappable/clickable. */
  href?:    (row: T) => string
  /** Rendered when rows is empty — pass an <EmptyState />. */
  empty?:   React.ReactNode
  /** Extra classes on a row, e.g. to tint cancelled records. */
  rowClassName?: (row: T) => string | undefined
  /** Desktop-only trailing cell (action buttons). Skipped on mobile. */
  actions?: (row: T) => React.ReactNode
}

export function DataTable<T>({
  rows, columns, rowKey, href, empty, rowClassName, actions,
}: Props<T>) {
  if (rows.length === 0) return <>{empty ?? null}</>

  const desktopCols = columns.filter((c) => c.card !== 'hidden' || true)
  const title    = columns.find((c) => c.card === 'title')
  const subtitle = columns.find((c) => c.card === 'subtitle')
  const badges   = columns.filter((c) => c.card === 'badge')
  const metas    = columns.filter((c) => c.card === 'meta')
  const body     = columns.filter((c) => !c.card)

  return (
    <>
      {/* ── Mobile cards ─────────────────────────────────────────── */}
      <div className="space-y-2 sm:hidden">
        {rows.map((row) => {
          const inner = (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {title && (
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {title.render(row)}
                    </div>
                  )}
                  {subtitle && (
                    <div className="mt-0.5 truncate text-xs text-gray-500">
                      {subtitle.render(row)}
                    </div>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  {badges.map((c) => <div key={c.key}>{c.render(row)}</div>)}
                  {href && <ChevronRight size={15} className="text-gray-300" />}
                </div>
              </div>

              {body.length > 0 && (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-gray-100 pt-2">
                  {body.map((c) => (
                    <div key={c.key} className="min-w-0">
                      {!c.hideLabel && (
                        <dt className="text-[10px] uppercase tracking-wide text-gray-400">{c.header}</dt>
                      )}
                      <dd className="truncate text-xs text-gray-800">{c.render(row)}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {metas.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {metas.map((c) => <div key={c.key}>{c.render(row)}</div>)}
                </div>
              )}
            </>
          )

          const cls = cn(
            'block rounded-xl border border-gray-200 bg-white p-3',
            href && 'active:bg-forest-50/40',
            rowClassName?.(row),
          )

          return href ? (
            <Link key={rowKey(row)} href={href(row)} className={cls}>{inner}</Link>
          ) : (
            <div key={rowKey(row)} className={cls}>{inner}</div>
          )
        })}
      </div>

      {/* ── Desktop table ────────────────────────────────────────── */}
      <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white sm:block">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              {desktopCols.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    'px-4 py-2.5 font-medium',
                    c.align === 'right'  && 'text-right',
                    c.align === 'center' && 'text-center',
                  )}
                >
                  {c.header}
                </th>
              ))}
              {actions && <th className="px-4 py-2.5" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn('transition-colors hover:bg-forest-50/40', rowClassName?.(row))}
              >
                {desktopCols.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      'px-4 py-2.5',
                      c.align === 'right'  && 'text-right',
                      c.align === 'center' && 'text-center',
                      c.className,
                    )}
                  >
                    {href && c.card === 'title' ? (
                      <Link href={href(row)} className="font-medium text-gray-900 hover:underline">
                        {c.render(row)}
                      </Link>
                    ) : c.render(row)}
                  </td>
                ))}
                {actions && <td className="px-4 py-2.5 text-right">{actions(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
