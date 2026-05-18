import { TrendingUp } from 'lucide-react'
import { formatBDT } from '@/lib/formatters/currency'
import { CHARGE_CATEGORY_BADGE } from '@/components/checkout/labels'
import type { UpsalesSummary } from '@/lib/queries/upsales'

/**
 * Server-rendered upsales summary. Renders as an additional section below the
 * existing booking analytics on /analytics — total upsales, breakdown by
 * category, top items, and per-staff attribution.
 */
export function UpsalesPanel({ data }: { data: UpsalesSummary }) {
  if (data.total_charges === 0) {
    return (
      <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-6 text-center">
        <TrendingUp size={22} className="mx-auto text-violet-600" />
        <p className="mt-2 text-sm font-semibold text-violet-900">No upsales in this period</p>
        <p className="mt-1 text-xs text-violet-700">
          Upsales = food, beverage, room, and extra-guest charges added at checkout time.
        </p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider font-semibold text-violet-700">
              Upsales (charges added during stay)
            </p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-violet-900">
              {formatBDT(data.total_amount)}
            </p>
          </div>
          <p className="text-xs text-violet-700 text-right">
            {data.total_charges} charge{data.total_charges === 1 ? '' : 's'}
            <br />
            across {data.by_category.length} categor{data.by_category.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By category */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">
              By Category
            </h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {data.by_category.map((c) => (
                <tr key={c.slug}>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      CHARGE_CATEGORY_BADGE[c.slug] ?? 'bg-gray-100 text-gray-700 border-gray-200'
                    }`}>
                      {c.display_name}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-gray-500 tabular-nums">
                    {c.qty} units
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-gray-900">
                    {formatBDT(c.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Top items */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">
              Top Items
            </h3>
          </div>
          {data.top_items.length === 0 ? (
            <p className="text-center text-xs text-gray-500 py-6">No items.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-gray-100">
                {data.top_items.map((it, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-gray-900">{it.name}</td>
                    <td className="px-4 py-2 text-right text-xs text-gray-500 tabular-nums">{it.qty}×</td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-gray-900">
                      {formatBDT(it.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* By staff */}
      {data.by_staff.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600">
              By Staff
            </h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {data.by_staff.map((s) => (
                <tr key={s.user_id ?? '__unknown__'}>
                  <td className="px-4 py-2 text-gray-900">{s.full_name}</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-500 tabular-nums">{s.qty} units</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums font-semibold text-gray-900">
                    {formatBDT(s.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
