'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Lock } from 'lucide-react'
import { formatBDT } from '@/lib/formatters/currency'
import { SALARY_ADJUSTMENT_LABELS, ADDITION_TYPES, formatPeriod } from '@/components/hr/labels'
import { deleteAdjustment } from '@/lib/actions/salary-adjustments'
import type { SalaryAdjustmentRow } from '@/lib/supabase/types'

interface Props {
  rows: SalaryAdjustmentRow[]
}

export function AdjustmentsList({ rows }: Props) {
  const router  = useRouter()
  const [pending, startTransition] = useTransition()

  function handleDelete(id: string) {
    if (!confirm('Delete this adjustment?')) return
    startTransition(async () => {
      const r = await deleteAdjustment(id)
      if (!r.success) { alert(r.error); return }
      router.refresh()
    })
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
        <p className="text-sm font-medium text-gray-700">No adjustments yet.</p>
        <p className="mt-1 text-xs text-gray-500">Click &quot;Add Adjustment&quot; to record a fine, bonus, or advance.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const isAddition = ADDITION_TYPES.includes(r.type)
              const locked     = !!r.payroll_run_line_id
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2 align-top whitespace-nowrap">{formatPeriod(r.applies_to_month)}</td>
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      isAddition
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}>
                      {SALARY_ADJUSTMENT_LABELS[r.type]}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-right font-mono tabular-nums">
                    <span className={isAddition ? 'text-emerald-700' : 'text-rose-700'}>
                      {isAddition ? '+' : '−'} {formatBDT(Number(r.amount))}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-xs text-gray-500">{r.description ?? '—'}</td>
                  <td className="px-3 py-2 align-top text-right">
                    {locked ? (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        <Lock size={12} /> Finalized
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleDelete(r.id)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
