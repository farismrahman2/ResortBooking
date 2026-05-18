'use client'

import { useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Lock } from 'lucide-react'
import { formatPeriod, PAYROLL_STATUS_BADGE, PAYROLL_STATUS_LABELS } from '@/components/hr/labels'
import { finalizePayrollRun } from '@/lib/actions/payroll'
import type { PaymentMethod, PayrollRunStatus } from '@/lib/supabase/types'

interface Props {
  periodIso:    string
  status:       PayrollRunStatus
  finalizedAt:  string | null
  canFinalize:  boolean
  earliestDate: string             // YYYY-MM-DD when finalize becomes available
  hasLines:     boolean
}

const METHOD_OPTIONS: PaymentMethod[] = [
  'cash', 'bkash', 'nagad', 'rocket', 'bank_transfer', 'cheque', 'other',
]

export function PayrollControlBar({
  periodIso, status, finalizedAt, canFinalize, earliestDate, hasLines,
}: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [error, setError]   = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function shift(by: number) {
    const d = new Date(periodIso + 'T00:00:00')
    d.setMonth(d.getMonth() + by)
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', next)
    router.replace(`?${params.toString()}`)
  }

  function finalize() {
    if (!confirm(
      `Finalize payroll for ${formatPeriod(periodIso)}?\n\n`
      + `This will create one expense per staff in the salary category, link `
      + `loan repayments + adjustments to this run, and lock all month-scoped `
      + `adjustments.\n\nCannot be undone (no auto-rollback in v1).`,
    )) return
    setError(null); setSuccess(null)
    startTransition(async () => {
      const r = await finalizePayrollRun(periodIso, method)
      if (!r.success) { setError(r.error); return }
      setSuccess(`Finalized. ${r.data.expenses_written} expense rows written.`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <Button variant="outline" size="sm" onClick={() => shift(-1)} className="gap-1">
          <ChevronLeft size={14} /> Prev
        </Button>
        <p className="px-2 text-sm font-semibold text-gray-900">{formatPeriod(periodIso)}</p>
        <Button variant="outline" size="sm" onClick={() => shift(1)} className="gap-1">
          Next <ChevronRight size={14} />
        </Button>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${PAYROLL_STATUS_BADGE[status]}`}>
          {status === 'finalized' && <Lock size={10} className="mr-1" />}
          {PAYROLL_STATUS_LABELS[status]}
        </span>
        {finalizedAt && (
          <span className="text-xs text-gray-500">
            on {new Date(finalizedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {status !== 'finalized' && (
            <>
              <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="!w-40">
                {METHOD_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
              <Button
                variant="primary"
                size="md"
                loading={pending}
                disabled={!canFinalize || !hasLines}
                onClick={finalize}
              >
                Finalize Payroll
              </Button>
            </>
          )}
        </div>
      </div>

      {!canFinalize && status !== 'finalized' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>You can finalize this period from {earliestDate} onward. Until then, this is a read-only preview.</span>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}
    </div>
  )
}
