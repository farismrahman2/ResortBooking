import { Layers } from 'lucide-react'
import { num } from '@/lib/kitchen/messages'
import type { RequisitionFamily } from '@/lib/queries/kitchen'

/**
 * The order as it now stands — original plus every approved amendment, netted.
 *
 * The reason this exists rather than leaving people to read three documents:
 * whoever takes delivery at 6am has one clipboard and no interest in
 * arithmetic. Handing them an original and two change notes is how 3kg
 * becomes 30kg, and the mistake surfaces as a bill nobody can explain.
 *
 * Only shown once an amendment has actually been approved; on an unamended
 * requisition it would just be the list again.
 */
export function EffectiveOrder({
  effective,
}: {
  effective: RequisitionFamily['effective']
}) {
  const changed = effective.filter((e) => e.change !== 0)
  if (changed.length === 0) return null

  return (
    <div className="overflow-hidden rounded-xl border-2 border-amber-300 bg-white">
      <p className="flex items-center gap-1.5 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-900">
        <Layers size={13} /> Order as it now stands
      </p>
      <ul className="divide-y divide-gray-100">
        {changed.map((e) => (
          <li key={e.item_key} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{e.item_name}</span>
            <span className="flex-shrink-0 font-mono text-sm">
              <span className="text-gray-400 line-through">{num(e.original)}</span>
              <span className={`ml-2 font-semibold ${e.net > e.original ? 'text-green-700' : 'text-red-700'}`}>
                {num(e.net)}
              </span>
              <span className="ml-1.5 text-xs text-gray-500">
                ({e.change > 0 ? '+' : '−'}{num(Math.abs(e.change))})
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="border-t border-gray-100 px-4 py-2 text-[11px] text-gray-600">
        Deliver against these numbers. Items not listed here are unchanged from the
        original sheet.
      </p>
    </div>
  )
}
