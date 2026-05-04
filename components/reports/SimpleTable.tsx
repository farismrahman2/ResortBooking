import type { ReactNode } from 'react'

interface Column<T> {
  key: keyof T | string
  label: string
  align?: 'left' | 'right' | 'center'
  render?: (row: T) => ReactNode
}

interface Props<T> {
  rows: T[]
  columns: Column<T>[]
  totals?: Partial<Record<keyof T | string, ReactNode>>
  emptyMessage?: string
}

/** Lightweight table for report data — no pagination, no sort UI. */
export function SimpleTable<T extends Record<string, any>>({  // eslint-disable-line @typescript-eslint/no-explicit-any
  rows, columns, totals, emptyMessage = 'No data for this period',
}: Props<T>) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
        {emptyMessage}
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr className="text-xs uppercase tracking-wide text-gray-500">
              {columns.map((c) => (
                <th key={String(c.key)}
                  className={`px-3 py-2 font-medium ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50/60">
                {columns.map((c) => (
                  <td key={String(c.key)}
                    className={`px-3 py-2 ${c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : ''}`}>
                    {c.render ? c.render(row) : String(row[c.key as keyof T] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totals && (
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                {columns.map((c) => (
                  <td key={String(c.key)}
                    className={`px-3 py-2 ${c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : ''}`}>
                    {totals[c.key as keyof T] ?? ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
