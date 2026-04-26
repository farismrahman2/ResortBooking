'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { confirmDraftExpense, discardDraftExpense } from '@/lib/actions/expenses'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import { CATEGORY_GROUP_BADGE, PAYMENT_METHOD_OPTIONS } from '@/components/expenses/labels'
import type { ExpenseRowWithRefs, PaymentMethod } from '@/lib/supabase/types'

interface Props {
  draft: ExpenseRowWithRefs
}

export function DraftConfirmCard({ draft }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)

  const [amount,        setAmount]        = useState<number>(Number(draft.amount) || 0)
  const [description,   setDescription]   = useState<string>(draft.description ?? '')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(draft.payment_method)
  const [reference,     setReference]     = useState<string>(draft.reference_number ?? '')

  function handleConfirm() {
    setError(null)
    if (amount <= 0) {
      setError('Enter an amount greater than 0')
      return
    }
    startTransition(async () => {
      const result = await confirmDraftExpense(draft.id, {
        amount,
        description:      description.trim() || null,
        payment_method:   paymentMethod,
        reference_number: reference.trim() || null,
      })
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  function handleDiscard() {
    if (!confirm('Discard this draft? It will not appear in your records.')) return
    setError(null)
    startTransition(async () => {
      const result = await discardDraftExpense(draft.id)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              CATEGORY_GROUP_BADGE[draft.category.category_group]
            }`}
          >
            {draft.category.name}
          </span>
          <span className="text-xs text-gray-600">
            <span className="font-medium">{formatDate(draft.expense_date)}</span>
            {draft.payee && <> · {draft.payee.name}</>}
          </span>
          {draft.recurring_template_id && (
            <span className="inline-flex items-center rounded-full bg-indigo-100 border border-indigo-300 px-2 py-0.5 text-[10px] font-semibold text-indigo-800">
              recurring
            </span>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">
          Draft — needs review
        </span>
      </div>

      {/* Editable fields */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-3">
        <div className="sm:col-span-3">
          <NumberInput
            label="Amount"
            prefix="৳"
            value={amount}
            onChange={setAmount}
          />
          {Number(draft.amount) === 1 && (
            <p className="mt-1 text-[10px] text-amber-700">⚠ Default placeholder — set the actual amount</p>
          )}
        </div>
        <div className="sm:col-span-5">
          <Input
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={draft.description ?? '(optional)'}
          />
        </div>
        <div className="sm:col-span-2">
          <Select
            label="Payment"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
          >
            {PAYMENT_METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <div className="sm:col-span-2">
          <Input
            label="Reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={paymentMethod === 'cash' ? '(n/a)' : 'trxID'}
            disabled={paymentMethod === 'cash'}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          Suggested: <span className="font-mono">{formatBDT(Number(draft.amount))}</span>
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" loading={pending} onClick={handleDiscard} className="gap-1">
            <X size={12} />
            Discard
          </Button>
          <Button variant="primary" size="sm" loading={pending} onClick={handleConfirm} className="gap-1">
            <Check size={12} />
            Confirm
          </Button>
        </div>
      </div>
    </div>
  )
}
