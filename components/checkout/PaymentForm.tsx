'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller, useWatch } from 'react-hook-form'
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
import {
  requiresAccount, missingAccountError, ACCOUNT_LABEL, ACCOUNT_PLACEHOLDER,
} from '@/lib/payments/account-rules'
import { addPayment, removePayment } from '@/lib/actions/checkout'
import { formatBDT } from '@/lib/formatters/currency'
import type { CheckoutPaymentRow } from '@/lib/supabase/types'
import { toast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { safeCall } from '@/lib/actions/safe-call'

interface Props {
  checkoutId: string
  payments:   CheckoutPaymentRow[]
  /** The resort's accounts/wallets/terminals — where this money lands. */
  accounts?:  Array<{ id: string; display_name: string; method: string; bank_name: string | null }>
  /** Suggested amount (= net due) to prefill the input */
  suggestedAmount?: number
  /** Disabled when checkout is finalized/voided */
  disabled?: boolean
}

export function PaymentForm({ checkoutId, payments, accounts = [], suggestedAmount, disabled }: Props) {
  const confirm = useConfirm()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, control, reset, setValue, formState: { errors } } = useForm<AddPaymentInput>({
    resolver: zodResolver(addPaymentSchema),
    defaultValues: {
      amount:    suggestedAmount && suggestedAmount > 0 ? suggestedAmount : 0,
      method:    'cash',
      reference: '',
      notes:     '',
      account_id: null,
      card_last4: null,
    },
  })

  const chosenMethod = useWatch({ control, name: 'method' })
  const chosenAccount = useWatch({ control, name: 'account_id' })
  const matching = accounts.filter((a) => a.method === chosenMethod)

  // Cards and bank transfers are never defaulted: three POS machines and two
  // bank accounts mean a pre-selected one would be the wrong one most of the
  // time, and a wrongly-attributed payment is harder to find than a missing
  // one. Cash and bKash have a single home, so those still fill themselves in.
  const mustChoose = requiresAccount(chosenMethod) && matching.length > 0
  useEffect(() => {
    setValue('account_id', requiresAccount(chosenMethod) ? null : (matching[0]?.id ?? null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenMethod, accounts.length])

  const blocked = mustChoose && !chosenAccount

  const accountName = (id: string | null | undefined) =>
    id ? (accounts.find((a) => a.id === id)?.display_name ?? null) : null

  // Payments already on the sheet that can't be reconciled — finalize refuses
  // while any remain, so the reason is stated up front, not at the last click.
  const unassigned = payments.filter(
    (p) => requiresAccount(p.method) && !p.account_id && accounts.length > 0)

  function onSubmit(values: AddPaymentInput) {
    if (requiresAccount(values.method) && matching.length > 0 && !values.account_id) {
      setError(missingAccountError(values.method))
      return
    }
    setError(null)
    startTransition(async () => {
      const r = await safeCall(() => addPayment(checkoutId, values))
      if (!r.success) { setError(r.error); return }
      reset({ amount: 0, method: 'cash', reference: '', notes: '', account_id: null, card_last4: null })
      router.refresh()
    })
  }

  async function handleRemove(id: string) {
    const ok = await confirm({ title: 'Remove this payment?', description: 'The outstanding balance will increase by this amount.', confirmLabel: 'Remove', danger: true })
    if (!ok) return
    startTransition(async () => {
      const r = await safeCall(() => removePayment(id))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Payment removed')
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {unassigned.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            <strong>
              {unassigned.length} payment{unassigned.length === 1 ? '' : 's'} below
              {unassigned.length === 1 ? " doesn't" : " don't"} say where the money landed.
            </strong>{' '}
            Checkout can&apos;t be finalized until every card and bank transfer names its POS
            machine or bank account. Remove {unassigned.length === 1 ? 'it' : 'them'} and re-add
            with the destination selected.
          </span>
        </div>
      )}

      {/* List of recorded payments */}
      {payments.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Method</th>
                  <th className="px-3 py-2 font-medium">Landed in</th>
                  <th className="px-3 py-2 font-medium">Reference</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-3 py-2 text-gray-900">
                      {CHECKOUT_PAYMENT_METHOD_LABELS[p.method]}
                      {p.card_last4 && (
                        <span className="block text-[11px] text-gray-500">•••• {p.card_last4}</span>
                      )}
                    </td>
                    {/* An unnamed card/bank line blocks finalize — show which
                        one it is instead of only failing at the last click. */}
                    <td className="px-3 py-2 text-xs">
                      {accountName(p.account_id) ?? (
                        requiresAccount(p.method) && accounts.length > 0
                          ? <span className="font-medium text-red-600">not selected</span>
                          : <span className="text-gray-400">—</span>
                      )}
                    </td>
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
              {accounts.length > 0 && (
                <div>
                  <label className={`field-label ${mustChoose ? 'text-violet-800' : ''}`}>
                    {ACCOUNT_LABEL[chosenMethod] ?? 'Landed in'}
                    {mustChoose && <span className="ml-1 text-red-600">*</span>}
                  </label>
                  {/* Which account/terminal received it — what a bank statement
                      is matched against. Mandatory for card and bank transfer. */}
                  <select
                    {...register('account_id')}
                    aria-invalid={blocked}
                    className={`min-h-[42px] w-full rounded-lg border bg-white px-2 text-sm ${
                      blocked ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-300'}`}
                  >
                    <option value="">
                      {ACCOUNT_PLACEHOLDER[chosenMethod] ?? '— not specified —'}
                    </option>
                    {(matching.length ? matching : accounts).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.display_name}{a.bank_name ? ` · ${a.bank_name}` : ''}
                      </option>
                    ))}
                  </select>
                  {blocked && (
                    <p className="mt-1 text-[11px] text-red-600">
                      {missingAccountError(chosenMethod)}
                    </p>
                  )}
                </div>
              )}
              {accounts.length === 0 && requiresAccount(chosenMethod) && (
                <p className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
                  No {chosenMethod === 'card' ? 'POS machines' : 'bank accounts'} are set up, so this
                  payment can&apos;t say where it landed. Run{' '}
                  <code>005_resort_payment_accounts.sql</code> to add them.
                </p>
              )}
              {chosenMethod === 'card' && (
                <Input label="Card last 4 (optional)" placeholder="1234" maxLength={4} {...register('card_last4')} />
              )}
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" size="md" loading={pending}
                disabled={blocked} className="w-full gap-1.5">
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
