import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { type ChangeKind, type ChangeRequestRow } from '@/lib/actions/change-requests'
import { formatBDT } from '@/lib/formatters/currency'

const KINDS: Array<{ value: ChangeKind; label: string }> = [
  { value: 'discount', label: 'Discount' },
  { value: 'advance',  label: 'Advance payment received' },
  { value: 'cancel',   label: 'Cancel the booking' },
  { value: 'other',    label: 'Something else' },
]
const STATUS = {
  pending:  'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
} as const

/** Corporate Sales, on their own booking: requests sent before they could change money themselves. */
export function ChangeRequestPanel({ requests }: { bookingId?: string; requests: ChangeRequestRow[] }) {
  return (
    <Card>
      <CardHeader><CardTitle>Earlier change requests</CardTitle></CardHeader>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">You can now change discounts, payments and cancel this booking yourself in Actions. These are requests sent before that.</p>
        {requests.length > 0 && (
          <ul className="divide-y divide-gray-100 border-t border-gray-100 pt-1">
            {requests.map((r) => (
              <li key={r.id} className="py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-1.5 py-0.5 text-[11px] font-semibold uppercase ${STATUS[r.status]}`}>{r.status}</span>
                  <span className="font-medium text-gray-800">{KINDS.find((k) => k.value === r.kind)?.label}</span>
                  {r.kind === 'discount' && <span className="text-gray-600">{[r.details.discount ? formatBDT(r.details.discount) : null, r.details.discount_pct ? `${r.details.discount_pct}%` : null].filter(Boolean).join(' + ')}</span>}
                  {r.kind === 'advance' && <span className="text-gray-600">{formatBDT(r.details.amount ?? 0)}</span>}
                  <span className="ml-auto text-gray-400">{new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                </div>
                {r.note && <p className="mt-0.5 text-gray-500">{r.note}</p>}
                {r.decision_note && <p className="mt-0.5 text-gray-700">Admin: {r.decision_note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
