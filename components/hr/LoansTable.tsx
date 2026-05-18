'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import { LOAN_STATUS_BADGE, LOAN_STATUS_LABELS } from '@/components/hr/labels'
import { closeLoan, writeOffLoan } from '@/lib/actions/loans'
import type { LoanWithEmployee } from '@/lib/queries/loans'

interface Props {
  rows: LoanWithEmployee[]
}

export function LoansTable({ rows }: Props) {
  const router  = useRouter()
  const [pending, startTransition] = useTransition()

  function handleClose(id: string) {
    startTransition(async () => {
      await closeLoan(id)
      router.refresh()
    })
  }
  function handleWriteOff(id: string) {
    if (!confirm('Write off this loan? Outstanding balance will be considered uncollectable.')) return
    startTransition(async () => {
      await writeOffLoan(id)
      router.refresh()
    })
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">No loans recorded.</p>
        <p className="mt-1 text-xs text-gray-500">Use the form to record a new loan.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[840px]">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 text-right font-medium">Principal</th>
              <th className="px-3 py-2 text-right font-medium">Installment</th>
              <th className="px-3 py-2 text-right font-medium">Repaid</th>
              <th className="px-3 py-2 text-right font-medium">Outstanding</th>
              <th className="px-3 py-2 font-medium">Repayment Starts</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 align-top">
                  <p className="font-medium text-gray-900">{r.employee.full_name}</p>
                  <p className="text-xs font-mono text-gray-500">{r.employee.employee_code}</p>
                </td>
                <td className="px-3 py-2 align-top text-right font-mono tabular-nums">{formatBDT(r.principal)}</td>
                <td className="px-3 py-2 align-top text-right font-mono tabular-nums text-gray-700">{formatBDT(r.monthly_installment)}</td>
                <td className="px-3 py-2 align-top text-right font-mono tabular-nums text-gray-700">{formatBDT(r.amount_repaid)}</td>
                <td className="px-3 py-2 align-top text-right font-mono tabular-nums font-semibold text-sky-700">{formatBDT(r.outstanding)}</td>
                <td className="px-3 py-2 align-top text-xs text-gray-500 whitespace-nowrap">
                  Taken {formatDate(r.taken_on)}<br />
                  Starts {formatDate(r.repayment_starts)}
                </td>
                <td className="px-3 py-2 align-top">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${LOAN_STATUS_BADGE[r.status]}`}>
                    {LOAN_STATUS_LABELS[r.status]}
                  </span>
                </td>
                <td className="px-3 py-2 align-top text-right">
                  {r.status === 'active' && (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => handleClose(r.id)}>
                        Close
                      </Button>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => handleWriteOff(r.id)}>
                        Write off
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
