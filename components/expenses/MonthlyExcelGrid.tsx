import { formatBDT } from '@/lib/formatters/currency'
import { CATEGORY_GROUP_BADGE } from '@/components/expenses/labels'
import type { MonthlyExpenseSummary } from '@/lib/queries/expenses'

interface MonthlyExcelGridProps {
  summary: MonthlyExpenseSummary
  /** When true, hide controls + scrollbars + use compact spacing for print. */
  printMode?: boolean
}

/**
 * Excel-style monthly pivot. Columns = active categories (in display_order),
 * rows = each day of the month, footer = column totals.
 *
 * Cells with no expense are blank (not "0") so the table reads like the original Excel.
 * Day-total column on the right; grand-total in the footer-right.
 */
export function MonthlyExcelGrid({ summary, printMode = false }: MonthlyExcelGridProps) {
  const { categories, days, category_totals, grand_total } = summary

  if (categories.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        No active categories. Activate at least one in <span className="font-medium">Categories</span>.
      </div>
    )
  }

  return (
    <div className={printMode ? '' : 'rounded-xl border border-gray-200 bg-white overflow-hidden'}>
      <div className={printMode ? '' : 'overflow-x-auto'}>
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                Date
              </th>
              {categories.map((c) => (
                <th
                  key={c.id}
                  className="border-b border-gray-200 px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-600 whitespace-nowrap"
                  title={c.name}
                >
                  <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] ${CATEGORY_GROUP_BADGE[c.category_group]}`}>
                    {c.name}
                  </span>
                </th>
              ))}
              <th className="border-b border-l border-gray-200 px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-rose-700 bg-rose-50 whitespace-nowrap">
                Day Total
              </th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const empty = d.day_total === 0
              return (
                <tr key={d.date} className={empty ? 'bg-white' : 'bg-white hover:bg-gray-50/40'}>
                  <td className="sticky left-0 z-10 bg-inherit border-r border-gray-100 px-3 py-1.5 font-mono text-gray-700 whitespace-nowrap">
                    {d.date.slice(8, 10)}
                    <span className="ml-1 text-[9px] text-gray-400">
                      {new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' })}
                    </span>
                  </td>
                  {categories.map((c) => {
                    const v = d.cells[c.slug] ?? 0
                    return (
                      <td
                        key={c.id}
                        className={`border-b border-gray-100 px-2 py-1.5 text-right font-mono tabular-nums ${
                          v > 0 ? 'text-gray-800' : 'text-gray-300'
                        }`}
                      >
                        {v > 0 ? formatBDT(v) : ''}
                      </td>
                    )
                  })}
                  <td
                    className={`border-b border-l border-gray-200 px-3 py-1.5 text-right font-mono font-semibold tabular-nums ${
                      empty ? 'text-gray-300 bg-rose-50/30' : 'text-rose-800 bg-rose-50'
                    }`}
                  >
                    {empty ? '' : formatBDT(d.day_total)}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td className="sticky left-0 z-10 bg-gray-50 border-t border-r border-gray-200 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-gray-700">
                Totals
              </td>
              {categories.map((c) => {
                const v = category_totals[c.slug] ?? 0
                return (
                  <td
                    key={c.id}
                    className="border-t border-gray-200 px-2 py-2 text-right font-mono text-xs font-bold tabular-nums text-gray-900"
                  >
                    {v > 0 ? formatBDT(v) : <span className="text-gray-300">—</span>}
                  </td>
                )
              })}
              <td className="border-t border-l-2 border-rose-300 bg-rose-100 px-3 py-2 text-right font-mono text-sm font-bold tabular-nums text-rose-900">
                {formatBDT(grand_total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
