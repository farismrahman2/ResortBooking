import Link from 'next/link'
import type { InvMovement } from '@/lib/supabase/types-inventory'
import { formatBDT } from '@/lib/formatters/currency'

const TYPE_BADGE: Record<string, string> = {
  receipt:    'bg-emerald-50 text-emerald-700',
  issue:      'bg-blue-50 text-blue-700',
  transfer:   'bg-violet-50 text-violet-700',
  adjustment: 'bg-amber-50 text-amber-700',
}

export function MovementsTable({ movements }: { movements: InvMovement[] }) {
  if (movements.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">No movements yet.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Number</th>
            <th className="px-4 py-2.5 font-medium">Type</th>
            <th className="px-4 py-2.5 font-medium">Date</th>
            <th className="px-4 py-2.5 font-medium text-right">Value</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {movements.map((m) => (
            <tr key={m.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={`/inventory/movements/${m.id}`} className="font-mono text-xs text-teal-700 hover:underline">
                  {m.movement_number}
                </Link>
              </td>
              <td className="px-4 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TYPE_BADGE[m.movement_type] ?? 'bg-gray-100 text-gray-700'}`}>
                  {m.movement_type}
                </span>
              </td>
              <td className="px-4 py-2.5 text-gray-600">{m.movement_date}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">
                {m.movement_type === 'receipt' ? formatBDT(m.total_value) : '—'}
              </td>
              <td className="px-4 py-2.5">
                {m.status === 'voided'
                  ? <span className="text-xs font-medium text-red-600">Voided</span>
                  : <span className="text-xs font-medium text-emerald-600">Completed</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
