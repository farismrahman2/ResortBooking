import Link from 'next/link'
import type { CrmActivityWithRelations } from '@/lib/supabase/types-crm'
import { ACTIVITY_TYPE_LABELS } from './labels'

const OUTCOME_DOT: Record<string, string> = {
  positive: 'bg-emerald-500', neutral: 'bg-gray-300', negative: 'bg-red-500',
}

export function ActivitiesFeed({ activities, showAccount = true }: { activities: CrmActivityWithRelations[]; showAccount?: boolean }) {
  if (activities.length === 0) {
    return <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">No activities logged.</p>
  }
  // Group by date
  const byDate = new Map<string, CrmActivityWithRelations[]>()
  for (const a of activities) {
    const arr = byDate.get(a.activity_date) ?? []
    arr.push(a); byDate.set(a.activity_date, arr)
  }

  return (
    <div className="space-y-4">
      {[...byDate.entries()].map(([date, items]) => (
        <div key={date}>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{date}</p>
          <div className="space-y-2">
            {items.map((a) => (
              <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      {a.outcome && <span className={`h-2 w-2 rounded-full ${OUTCOME_DOT[a.outcome]}`} />}
                      <span className="text-xs font-semibold text-amber-700">{ACTIVITY_TYPE_LABELS[a.activity_type]}</span>
                      <span className="font-medium text-gray-900">{a.subject}</span>
                    </div>
                    {a.notes && <p className="mt-0.5 text-sm text-gray-600">{a.notes}</p>}
                    <p className="mt-0.5 text-xs text-gray-400">
                      {showAccount && a.account_name ? `${a.account_name} · ` : ''}
                      {a.contact_name ? `${a.contact_name} · ` : ''}
                      {a.logged_by_name ?? ''}
                    </p>
                    {a.next_step && (
                      <p className="mt-1 text-xs text-amber-700">→ {a.next_step}{a.next_step_date ? ` (${a.next_step_date})` : ''}</p>
                    )}
                  </div>
                  {showAccount && (
                    <Link href={`/crm/accounts/${a.account_id}`} className="shrink-0 text-xs text-amber-700 hover:underline">account →</Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
