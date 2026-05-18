'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'
import { upsertServiceCharge, deleteServiceCharge } from '@/lib/actions/service-charge'
import { formatBDT } from '@/lib/formatters/currency'

interface Row {
  id?: string
  employee_id: string
  full_name:   string
  employee_code: string
  amount:      number
}

interface Props {
  monthIso: string                // YYYY-MM-01
  rows:     Row[]
}

export function ServiceChargeForm({ monthIso, rows }: Props) {
  const router  = useRouter()
  const [pending, startTransition] = useTransition()
  const [local, setLocal] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const r of rows) m[r.employee_id] = r.amount
    return m
  })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError]   = useState<string | null>(null)

  function setAmount(empId: string, v: number) {
    setLocal((p) => ({ ...p, [empId]: v }))
  }

  function save(empId: string) {
    setError(null)
    setSavingId(empId)
    const amount = local[empId] ?? 0
    startTransition(async () => {
      const r = await upsertServiceCharge({
        employee_id:      empId,
        applies_to_month: monthIso,
        amount,
        notes:            '',
      })
      setSavingId(null)
      if (!r.success) { setError(r.error); return }
      router.refresh()
    })
  }

  function remove(rowId: string | undefined, empId: string) {
    if (!rowId) {
      setLocal((p) => ({ ...p, [empId]: 0 }))
      return
    }
    if (!confirm('Remove this service-charge entry?')) return
    startTransition(async () => {
      const r = await deleteServiceCharge(rowId)
      if (!r.success) { setError(r.error); return }
      setLocal((p) => ({ ...p, [empId]: 0 }))
      router.refresh()
    })
  }

  const total = Object.values(local).reduce((s, n) => s + Number(n ?? 0), 0)

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.employee_id}>
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium text-gray-900">{r.full_name}</p>
                    <p className="text-xs font-mono text-gray-500">{r.employee_code}</p>
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <NumberInput
                      prefix="৳"
                      value={local[r.employee_id] ?? 0}
                      onChange={(v) => setAmount(r.employee_id, v)}
                    />
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        loading={pending && savingId === r.employee_id}
                        onClick={() => save(r.employee_id)}
                      >
                        Save
                      </Button>
                      <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => remove(r.id, r.employee_id)}>
                        Clear
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-sky-50 text-sm font-semibold">
                <td className="px-3 py-2 text-right text-gray-700">Total for month</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-sky-900">{formatBDT(total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
