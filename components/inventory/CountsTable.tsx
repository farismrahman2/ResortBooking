import Link from 'next/link'
import type { InvCount } from '@/lib/supabase/types-inventory'

const STATUS: Record<string, string> = {
  in_progress: 'bg-amber-50 text-amber-700',
  finalized:   'bg-emerald-50 text-emerald-700',
  cancelled:   'bg-gray-100 text-gray-500',
}

export function CountsTable({ counts }: { counts: InvCount[] }) {
  if (counts.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">No counts yet.</p>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2.5 font-medium">Number</th>
            <th className="px-4 py-2.5 font-medium">Date</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {counts.map((c) => (
            <tr key={c.id} className="hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={`/inventory/counts/${c.id}`} className="font-mono text-xs text-teal-700 hover:underline">{c.count_number}</Link>
              </td>
              <td className="px-4 py-2.5 text-gray-600">{c.count_date}</td>
              <td className="px-4 py-2.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS[c.status] ?? ''}`}>
                  {c.status.replace('_', ' ')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
