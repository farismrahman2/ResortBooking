'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet, Check, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { recordPayment } from '@/lib/actions/kitchen-ledger'
import { safeCall } from '@/lib/actions/safe-call'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDateShort } from '@/lib/formatters/dates'
import { PAYMENT_METHOD_LABELS } from '@/lib/supabase/types-kitchen'
import type {
  KitchenVendor, PaymentMethod, DeliveryListRow, PaymentWithAllocations,
} from '@/lib/supabase/types-kitchen'

const METHODS: PaymentMethod[] = ['cheque', 'cash', 'bank_transfer', 'bkash', 'nagad', 'adjustment']

/**
 * Recording a payment, and — the part that matters — what it settles.
 *
 * A cheque handed to the beef supplier covers a fortnight of daily deliveries.
 * Recording only "we paid 40,000" tells you nothing when they later claim a
 * particular delivery is unpaid; allocating it across the open bills is what
 * makes that answerable, and is the only reason the vendor balance can
 * distinguish "settled" from "we've paid roughly that much".
 *
 * Written in one go rather than autosaved: a cheque is written once, with the
 * details in front of whoever is typing.
 */
export function PaymentForm({
  vendors, openBills, initial, paymentId, defaultVendorId,
}: {
  vendors:   KitchenVendor[]
  /** Confirmed deliveries with an outstanding balance, all vendors. */
  openBills: DeliveryListRow[]
  initial?:  PaymentWithAllocations | null
  paymentId?: string
  defaultVendorId?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const [vendorId, setVendorId] = useState(initial?.kitchen_vendor_id ?? defaultVendorId ?? '')
  const [date, setDate]         = useState(initial?.payment_date ?? new Date().toISOString().slice(0, 10))
  const [method, setMethod]     = useState<PaymentMethod>(initial?.method ?? 'cheque')
  const [chequeNo, setChequeNo] = useState(initial?.cheque_no ?? '')
  const [chequeDate, setChequeDate] = useState(initial?.cheque_date ?? '')
  const [bank, setBank]         = useState(initial?.bank_name ?? '')
  const [amount, setAmount]     = useState(initial ? String(initial.amount) : '')
  const [notes, setNotes]       = useState(initial?.notes ?? '')
  const [alloc, setAlloc] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const a of initial?.allocations ?? []) m[a.delivery_id] = String(a.amount_allocated)
    return m
  })
  const [error, setError] = useState<string | null>(null)

  const bills = useMemo(
    () => openBills.filter((b) => !vendorId || b.kitchen_vendor_id === vendorId),
    [openBills, vendorId],
  )
  const allocated = useMemo(
    () => Object.values(alloc).reduce((n, v) => n + (Number(v) || 0), 0),
    [alloc],
  )
  const amountNum = Number(amount) || 0
  const unallocated = amountNum - allocated

  /**
   * Settle the oldest bills first until the money runs out — how anyone does
   * this on paper, and it turns a screen of arithmetic into one tap. The last
   * bill takes whatever is left, which is the normal shape of a part payment.
   */
  function autoAllocate() {
    if (amountNum <= 0) { setError('Enter the amount first'); return }
    let left = amountNum
    const next: Record<string, string> = {}
    const oldestFirst = [...bills].sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))
    for (const b of oldestFirst) {
      if (left <= 0.009) break
      const take = Math.min(left, b.outstanding)
      next[b.id] = String(Math.round(take * 100) / 100)
      left -= take
    }
    setAlloc(next)
    setError(null)
    if (left > 0.009) {
      toast.info(`${formatBDT(left)} left over`, {
        description: 'More than the open bills — it stays on account.',
      })
    }
  }

  /**
   * Total every open receipt and set the payment to match — the actual habit
   * this replaces: tally the vendor's slips, write one cheque for the lot.
   * Fills the amount as well as the allocation, because with "settle all"
   * the amount is a consequence of the bills, not an independent number.
   */
  function payAll() {
    if (bills.length === 0) return
    const next: Record<string, string> = {}
    for (const b of bills) next[b.id] = String(Math.round(b.outstanding * 100) / 100)
    setAlloc(next)
    setAmount(String(Math.round(bills.reduce((n, b) => n + b.outstanding, 0) * 100) / 100))
    setError(null)
  }

  function submit() {
    setError(null)
    start(async () => {
      const r = await safeCall(() => recordPayment({
        kitchen_vendor_id: vendorId,
        payment_date: date,
        method,
        cheque_no: chequeNo || null,
        cheque_date: chequeDate || null,
        bank_name: bank || null,
        amount,
        notes: notes || null,
        allocations: Object.entries(alloc)
          .filter(([, v]) => (Number(v) || 0) > 0)
          .map(([delivery_id, v]) => ({ delivery_id, amount: Number(v) })),
      }, paymentId))
      if (!r.success) { setError(r.error); return }
      if (r.data?.expenseWarning) {
        // The payment is in, but its expense-book entry is not — say so loudly.
        toast.error(r.data.expenseWarning)
      } else {
        toast.success(paymentId ? 'Payment updated — posted to Expenses' : 'Payment recorded — posted to Expenses')
      }
      router.push('/kitchen/payments')
    })
  }

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 pb-28">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-800">
            Supplier <span className="text-red-500">*</span>
          </span>
          <select
            value={vendorId} onChange={(e) => { setVendorId(e.target.value); setAlloc({}) }}
            className="min-h-[44px] w-full rounded-xl border border-gray-300 bg-white px-3 text-base"
          >
            <option value="">— choose —</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.display_name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-800">
            Amount <span className="text-red-500">*</span>
          </span>
          <input
            inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0"
            className="min-h-[44px] w-full rounded-xl border border-gray-300 px-3 text-lg font-semibold"
          />
        </label>
      </div>

      <div>
        <span className="mb-1 block text-sm font-medium text-gray-800">Paid by</span>
        <div className="flex flex-wrap gap-1.5">
          {METHODS.map((m) => (
            <button
              key={m} type="button" onClick={() => setMethod(m)}
              className={cn('min-h-[40px] rounded-lg border px-3 text-xs font-medium',
                method === m
                  ? 'border-forest-500 bg-forest-50 text-forest-800'
                  : 'border-gray-300 bg-white text-gray-700')}
            >
              {PAYMENT_METHOD_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {method === 'cheque' && (
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">
              Cheque no. <span className="text-red-500">*</span>
            </span>
            <input
              value={chequeNo} onChange={(e) => setChequeNo(e.target.value)}
              inputMode="numeric"
              className="min-h-[44px] w-full rounded-lg border border-gray-300 px-2.5 text-base"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">Cheque date</span>
            <input
              type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)}
              className="min-h-[44px] w-full rounded-lg border border-gray-300 px-2.5 text-base"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-700">Bank</span>
            <input
              value={bank} onChange={(e) => setBank(e.target.value)}
              placeholder="Dutch-Bangla"
              className="min-h-[44px] w-full rounded-lg border border-gray-300 px-2.5 text-base"
            />
          </label>
          <p className="text-[11px] text-gray-500 sm:col-span-3">
            The cheque number is what matches this against the bank statement later. Without
            it, reconciling means going back through photographs.
          </p>
        </div>
      )}

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-800">Payment date</span>
        <input
          type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="min-h-[44px] w-full rounded-xl border border-gray-300 px-3 text-base sm:max-w-[240px]"
        />
      </label>

      {/* Allocation */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
            Which receipts does this settle?
            {bills.length > 0 && (
              <span className="ml-1.5 font-normal normal-case text-gray-500">
                {bills.length} open · {formatBDT(bills.reduce((n, b) => n + b.outstanding, 0))}
              </span>
            )}
          </p>
          <div className="flex gap-1.5">
            <button
              type="button" onClick={payAll}
              disabled={!vendorId || bills.length === 0}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-forest-700 px-2.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              <Sparkles size={12} /> Settle all
            </button>
            <button
              type="button" onClick={autoAllocate}
              disabled={!vendorId || bills.length === 0 || amountNum <= 0}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-forest-300 bg-white px-2.5 text-xs font-semibold text-forest-800 disabled:opacity-40"
            >
              Oldest first
            </button>
          </div>
        </div>

        {!vendorId ? (
          <p className="px-3 py-6 text-center text-sm text-gray-500">Pick a supplier first.</p>
        ) : bills.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-gray-500">
            Nothing outstanding for this supplier. The payment will sit on account.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {bills.map((b) => (
              <li key={b.id} className="flex items-center gap-2 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-900">
                    {/* Their receipt number leads. The tally is done off the
                        receipt book — DL-0007 means nothing to anyone holding
                        a stack of slips numbered 721, 725, 726. */}
                    {b.supplier_memo_no
                      ? <>Receipt {b.supplier_memo_no}<span className="ml-1.5 text-xs text-gray-400">{b.delivery_no}</span></>
                      : b.delivery_no}
                    <span className="ml-1.5 text-xs text-gray-500">{formatDateShort(b.delivery_date)}</span>
                  </span>
                  <span className="block text-[11px] text-gray-500">
                    {b.requisition_no ? `${b.requisition_no} · ` : ''}
                    Bill {formatBDT(b.total_amount)} · {formatBDT(b.outstanding)} due
                  </span>
                </span>
                <input
                  inputMode="decimal"
                  value={alloc[b.id] ?? ''}
                  onChange={(e) => setAlloc((prev) => ({
                    ...prev, [b.id]: e.target.value.replace(/[^0-9.]/g, ''),
                  }))}
                  placeholder="0"
                  className="min-h-[42px] w-[110px] flex-shrink-0 rounded-lg border border-gray-300 px-2 text-right text-base"
                />
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1 border-t border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Allocated</span>
            <span className="font-semibold">{formatBDT(allocated)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">
              {unallocated < 0 ? 'Over-allocated' : 'On account'}
            </span>
            <span className={cn('font-semibold', unallocated < -0.009 && 'text-red-700')}>
              {formatBDT(Math.abs(unallocated))}
            </span>
          </div>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-800">Notes</span>
        <textarea
          rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto max-w-[720px]">
          <button
            type="button" onClick={submit}
            disabled={pending || !vendorId || amountNum <= 0 || unallocated < -0.009}
            className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-forest-700 text-base font-semibold text-white disabled:opacity-50"
          >
            {pending
              ? <>Recording…</>
              : paymentId
                ? <><Check size={17} /> Save changes</>
                : <><Wallet size={17} /> Record {formatBDT(amountNum)}</>}
          </button>
        </div>
      </div>
    </div>
  )
}
