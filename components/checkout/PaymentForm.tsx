'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import {
  CHECKOUT_PAYMENT_METHOD_LABELS,
  CHECKOUT_PAYMENT_METHOD_OPTIONS,
} from '@/components/checkout/labels'
import { addPaymentSchema, type AddPaymentInput } from '@/lib/validators/checkout'
import { addPayment, removePayment } from '@/lib/actions/checkout'
import { formatBDT } from '@/lib/formatters/currency'
import type { CheckoutPaymentRow } from '@/lib/supabase/types'

interface Props {
  checkoutId: string
  payments:   CheckoutPaymentRow[]
  /** Suggested amount (= net due) to prefill the input */
  suggestedAmount?: number
  /** Disabled when checkout is finalized/voided */
  disabled?: boolean
}

export function PaymentForm({ checkoutId, payments, suggestedAmount, disabled }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<AddPaymentInput>({
    resolver: zodResolver(addPaymentSchema),
    defaultValues: {
      amount:    suggestedAmount && suggestedAmount > 0 ? suggestedAmount : 0,
      method:    'cash',
      reference: '',
      notes:     '',
    },
  })

  function onSubmit(values: AddPaymentInput) {
    setError(null)
    startTransition(async () => {
      const r = await addPayment(checkoutId, values)
      if (!r.success) { setError(r.error); return }
      reset({ amount: 0, method: 'cash', reference: '', notes: '' })
      router.refresh()
    })
  }

  function handleRemove(id: string) {
    if (!confirm('Remove this payment?')) return
    startTransition(async () => {
      const r = await removePayment(id)
      if (!r.success) { alert(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {/* List of recorded payments */}
      {payments.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-gray-900">{CHECKOUT_PAYMENT_METHOD_LABELS[p.method]}</td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-500">{p.reference ?? '—'}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                      {formatBDT(Number(p.amount))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!disabled && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleRemove(p.id)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add payment form */}
      {!disabled && (
        <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-700 inline-flex items-center gap-1.5">
            <Plus size={12} />
            Add Payment
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-3">
              <Controller
                name="amount"
                control={control}
                render={({ field }) => (
                  <NumberInput label="Amount" prefix="৳" value={field.value} onChange={field.onChange} error={errors.amount?.message} />
                )}
              />
            </div>
            <div className="sm:col-span-3">
              <Controller
                name="method"
                control={control}
                render={({ field }) => (
                  <Select label="Method" value={field.value} onChange={(e) => field.onChange(e.target.value)}>
                    {CHECKOUT_PAYMENT_METHOD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                )}
              />
            </div>
            <div className="sm:col-span-4">
              <Input label="Reference (optional)" placeholder="trxId / cheque #" {...register('reference')} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" size="md" loading={pending} className="w-full gap-1.5">
                <Plus size={14} /> Add
              </Button>
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>
      )}
    </div>
  )
}
