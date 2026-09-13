import type { AdvanceDay } from '@/lib/queries/reports/advance-payments'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import type { PackageType } from '@/lib/supabase/types'

const PACKAGE_LABEL: Record<PackageType, string> = {
  daylong: 'DAYLONG',
  night:   'NIGHT STAY',
  group:   'GROUP',
}

/** Cancelled and no-show bookings keep the money but not the stay. */
function statusNote(status: string | null): string | null {
  if (status === 'cancelled') return 'cancelled'
  if (status === 'no_show')   return 'no-show'
  return null
}

/**
 * One block per day, the way the front desk reads it: who paid, for which
 * visit, how much and by what method — then the day's total split by method.
 */
export function AdvancePaymentDays({ days }: { days: AdvanceDay[] }) {
  if (days.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
        No advance payments were received in this period.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {days.map((day) => (
        <div key={day.date} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-wrap items-baseline justify-between gap-2 bg-forest-700 px-3 py-2 text-white">
            <span className="text-sm font-semibold">{formatDate(day.date)}</span>
            <span className="text-xs text-forest-100">
              {day.rows.length} payment{day.rows.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 w-8">#</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Visit date</th>
                  <th className="px-3 py-2">Package</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Method</th>
                </tr>
              </thead>
              <tbody>
                {day.rows.map((r, i) => {
                  const note = statusNote(r.status)
                  return (
                    <tr key={r.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-3 py-2 text-gray-400 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2">
                        <span className="block font-medium text-gray-900">
                          {r.company_name ? `${r.company_name} — ${r.customer_name}` : r.customer_name}
                          {note && (
                            <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                              {note}
                            </span>
                          )}
                        </span>
                        <span className="block font-mono text-[11px] text-gray-500">{r.booking_number}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                        {r.visit_date ? formatDate(r.visit_date) : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium text-gray-600">
                        {r.package_type ? PACKAGE_LABEL[r.package_type] : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatBDT(r.amount)}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {r.method_label}
                        {r.reference && (
                          <span className="block font-mono text-[10px] text-gray-400">{r.reference}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-gray-50 text-sm font-semibold">
                  <td />
                  <td className="px-3 py-2" colSpan={3}>Day total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatBDT(day.total)}</td>
                  <td className="px-3 py-2 text-xs font-medium text-gray-600">
                    {day.byMethod.map((m) => `${m.label} ${formatBDT(m.amount)}`).join(' · ')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
