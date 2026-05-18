'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, AlertCircle, Save, Search, Tag, Gift, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { NumberInput } from '@/components/ui/NumberInput'
import { createCoffeeShopSale, updateCoffeeShopSale } from '@/lib/actions/coffee-shop'
import { PAYMENT_METHOD_LABELS } from './labels'
import { formatBDT } from '@/lib/formatters/currency'
import { getTodayInDhaka } from '@/lib/coffee-shop/timezone'
import type { ChargeCategoryRow, ChargeItemWithCategory } from '@/lib/supabase/types'
import type { CoffeeShopSaleFull, CoffeeShopPaymentMethod } from '@/lib/supabase/types-coffee-shop'

interface Props {
  categories: ChargeCategoryRow[]
  items:      ChargeItemWithCategory[]
  /** When set, the form pre-fills from this existing sale (edit mode). */
  initial?:   CoffeeShopSaleFull
  /** Required when editing — the action target ID. */
  saleId?:    string
}

interface DraftItem {
  charge_item_id:     string | null
  category_id:        string
  description:        string
  quantity:           number
  unit_price:         number
  is_complimentary:   boolean
  comp_authorized_by: string | null
  comp_reason:        string | null
}

interface DraftPayment {
  amount:    number
  method:    CoffeeShopPaymentMethod
  reference: string
}

const PAYMENT_OPTIONS: Array<{ value: CoffeeShopPaymentMethod; label: string }> =
  (Object.keys(PAYMENT_METHOD_LABELS) as CoffeeShopPaymentMethod[]).map((v) => ({ value: v, label: PAYMENT_METHOD_LABELS[v] }))

export function CoffeeShopSaleForm({ categories, items, initial, saleId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const isEdit = !!initial && !!saleId

  const [saleDate, setSaleDate] = useState<string>(initial?.sale_date ?? getTodayInDhaka())
  const [customerLabel, setCustomerLabel] = useState<string>(initial?.customer_label ?? '')
  const [notes, setNotes] = useState<string>(initial?.notes ?? '')
  const [activeCategoryId, setActiveCategoryId] = useState<string>(categories[0]?.id ?? '')
  const [search, setSearch] = useState('')

  const [lines, setLines] = useState<DraftItem[]>(
    initial
      ? initial.items.map((it) => ({
          charge_item_id:     it.charge_item_id,
          category_id:        it.category_id,
          description:        it.description,
          quantity:           Number(it.quantity),
          unit_price:         Number(it.unit_price),
          is_complimentary:   it.is_complimentary,
          comp_authorized_by: it.comp_authorized_by,
          comp_reason:        it.comp_reason,
        }))
      : [],
  )

  const [discountType, setDiscountType] = useState<'percent' | 'fixed' | ''>(initial?.discount_type ?? '')
  const [discountValue, setDiscountValue] = useState<number>(Number(initial?.discount_value ?? 0))
  const [discountReason, setDiscountReason] = useState<string>(initial?.discount_reason ?? '')

  const [payments, setPayments] = useState<DraftPayment[]>(
    initial
      ? initial.payments.map((p) => ({ amount: Number(p.amount), method: p.method, reference: p.reference ?? '' }))
      : [{ amount: 0, method: 'cash', reference: '' }],
  )

  // Live totals
  const totals = useMemo(() => {
    let subtotal = 0, comp = 0
    for (const l of lines) {
      const lineAmt = Number(l.quantity) * Number(l.unit_price)
      if (l.is_complimentary) comp += lineAmt; else subtotal += lineAmt
    }
    let discountAmount = 0
    if (discountType === 'percent') discountAmount = Math.round(subtotal * Number(discountValue ?? 0)) / 100
    else if (discountType === 'fixed') discountAmount = Math.min(Number(discountValue ?? 0), subtotal)
    discountAmount = Math.round(discountAmount * 100) / 100
    const net = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100)
    const tendered = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0)
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      comp: Math.round(comp * 100) / 100,
      discountAmount,
      net,
      tendered: Math.round(tendered * 100) / 100,
      balance: Math.round((net - tendered) * 100) / 100,
    }
  }, [lines, discountType, discountValue, payments])

  // Auto-pre-fill the first cash payment to the net amount when there's exactly one cash row
  function syncSingleCash() {
    if (payments.length === 1 && payments[0].method === 'cash') {
      setPayments([{ ...payments[0], amount: totals.net }])
    }
  }

  const itemsForCategory = items.filter((it) =>
    it.is_active &&
    it.is_available_in_coffee_shop &&
    it.category_id === activeCategoryId &&
    (search.trim() === '' || it.name.toLowerCase().includes(search.trim().toLowerCase())),
  )

  function addCatalogItem(item: ChargeItemWithCategory) {
    setLines((p) => {
      const existingIdx = p.findIndex((l) => l.charge_item_id === item.id && !l.is_complimentary)
      if (existingIdx >= 0) {
        const copy = [...p]
        copy[existingIdx] = { ...copy[existingIdx], quantity: copy[existingIdx].quantity + 1 }
        return copy
      }
      return [
        ...p,
        {
          charge_item_id:     item.id,
          category_id:        item.category_id,
          description:        item.name,
          quantity:           1,
          unit_price:         Number(item.default_price),
          is_complimentary:   false,
          comp_authorized_by: null,
          comp_reason:        null,
        },
      ]
    })
  }

  function addFreeForm() {
    setLines((p) => [
      ...p,
      {
        charge_item_id: null,
        category_id:    activeCategoryId,
        description:    '',
        quantity:       1,
        unit_price:     0,
        is_complimentary:   false,
        comp_authorized_by: null,
        comp_reason:        null,
      },
    ])
  }

  function patchLine(idx: number, patch: Partial<DraftItem>) {
    setLines((p) => p.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  function removeLine(idx: number) {
    setLines((p) => p.filter((_, i) => i !== idx))
  }

  function toggleComp(idx: number) {
    setLines((p) => p.map((l, i) => {
      if (i !== idx) return l
      if (l.is_complimentary) return { ...l, is_complimentary: false, comp_authorized_by: null, comp_reason: null }
      const reason = window.prompt('Comp reason (required):', '')
      if (!reason || reason.trim().length < 2) return l
      // Use the current user as authorizer — we don't have a UUID handy on the client,
      // so we send a sentinel and let the server resolve it via auth.uid(). For now,
      // require a non-empty reason; the server will substitute the user id.
      return { ...l, is_complimentary: true, comp_authorized_by: 'self', comp_reason: reason.trim() }
    }))
  }

  function patchPayment(idx: number, patch: Partial<DraftPayment>) {
    setPayments((p) => p.map((row, i) => i === idx ? { ...row, ...patch } : row))
  }
  function addPayment() {
    setPayments((p) => [...p, { amount: Math.max(0, totals.balance), method: 'bkash', reference: '' }])
  }
  function removePayment(idx: number) {
    setPayments((p) => p.filter((_, i) => i !== idx))
  }

  function submit() {
    setError(null)
    // Client-side guard: items, balance, comp validation
    if (lines.length === 0) { setError('Add at least one item.'); return }
    if (lines.some((l) => l.description.trim().length === 0)) { setError('Every item needs a description.'); return }
    if (lines.some((l) => l.is_complimentary && (!l.comp_reason || l.comp_reason.trim().length < 2))) {
      setError('Complimentary items require a reason.'); return
    }
    if (Math.abs(totals.balance) > 0.01) {
      setError(`Tendered (${formatBDT(totals.tendered)}) doesn't match Net (${formatBDT(totals.net)}).`)
      return
    }

    const payload = {
      sale_date:       saleDate,
      customer_label:  customerLabel.trim() || null,
      notes:           notes.trim() || null,
      items: lines.map((l) => ({
        charge_item_id:     l.charge_item_id,
        category_id:        l.category_id,
        description:        l.description.trim(),
        quantity:           Number(l.quantity),
        unit_price:         Number(l.unit_price),
        is_complimentary:   l.is_complimentary,
        comp_authorized_by: l.is_complimentary ? l.comp_authorized_by : null,
        comp_reason:        l.is_complimentary ? l.comp_reason : null,
      })),
      discount_type:   discountType === '' ? null : discountType,
      discount_value:  discountType ? Number(discountValue) : 0,
      discount_reason: discountType ? discountReason.trim() || null : null,
      payments:        payments
        .filter((p) => Number(p.amount) > 0)
        .map((p) => ({ amount: Number(p.amount), method: p.method, reference: p.reference.trim() || null })),
    }

    startTransition(async () => {
      const r = isEdit
        ? await updateCoffeeShopSale(saleId!, payload)
        : await createCoffeeShopSale(payload)
      if (!r.success) { setError(r.error); return }
      const id = isEdit ? saleId! : (r as any).data.sale_id  // eslint-disable-line @typescript-eslint/no-explicit-any
      router.push(`/coffee-shop/sales/${id}`)
      router.refresh()
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
      {/* LEFT: items + meta + payments */}
      <div className="space-y-4">
        {/* Sale meta */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            type="date"
            label="Sale date"
            value={saleDate}
            onChange={(e) => setSaleDate(e.target.value)}
            disabled={isEdit}  // can't change date on edit
          />
          <Input
            label="Customer (optional)"
            value={customerLabel}
            onChange={(e) => setCustomerLabel(e.target.value)}
            placeholder="e.g. Family of 4"
          />
        </div>

        {/* Item picker */}
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 p-3 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {categories.filter((c) => c.is_active).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCategoryId(c.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                    activeCategoryId === c.id
                      ? 'border-stone-400 bg-stone-100 text-stone-800'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-stone-300'
                  }`}
                >
                  {c.display_name}
                </button>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addFreeForm} className="ml-auto gap-1">
                <Plus size={12} /> Free-form
              </Button>
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                placeholder="Search items…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm placeholder:text-gray-400 focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-200"
              />
            </div>
          </div>
          <div className="p-3">
            {itemsForCategory.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No matching items in this category.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {itemsForCategory.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => addCatalogItem(it)}
                    className="rounded-lg border border-gray-200 bg-white p-2.5 text-left hover:border-stone-400 hover:bg-stone-50 transition-colors"
                  >
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2">{it.name}</p>
                    <p className="mt-1 text-[11px] font-mono text-stone-700">{formatBDT(Number(it.default_price))}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Line items */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-2.5">
            <h3 className="text-sm font-semibold text-gray-900">Items ({lines.length})</h3>
          </div>
          {lines.length === 0 ? (
            <div className="p-6 text-center text-xs text-gray-500">No items yet — pick from the catalog above or click &quot;Free-form&quot;.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-gray-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Unit price</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((l, i) => (
                    <tr key={i} className={l.is_complimentary ? 'bg-amber-50/30' : ''}>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="text"
                          value={l.description}
                          onChange={(e) => patchLine(i, { description: e.target.value })}
                          placeholder="Description"
                          className="w-full rounded border border-gray-200 px-2 py-1 text-sm focus:border-stone-500 focus:outline-none focus:ring-1 focus:ring-stone-200"
                        />
                        {l.is_complimentary && (
                          <p className="mt-1 text-[10px] text-amber-700 inline-flex items-center gap-1">
                            <Gift size={10} /> Complimentary — {l.comp_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top w-24">
                        <NumberInput value={l.quantity} onChange={(v) => patchLine(i, { quantity: v })} min={0.01} />
                      </td>
                      <td className="px-3 py-2 align-top w-28">
                        <NumberInput value={l.unit_price} onChange={(v) => patchLine(i, { unit_price: v })} min={0} prefix="৳" />
                      </td>
                      <td className="px-3 py-2 align-top text-right font-mono tabular-nums w-28">
                        {formatBDT(l.quantity * l.unit_price)}
                      </td>
                      <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                        <button type="button" onClick={() => toggleComp(i)} title="Toggle complimentary"
                          className={`mr-1 rounded p-1 transition-colors ${l.is_complimentary ? 'bg-amber-100 text-amber-700' : 'text-gray-400 hover:bg-amber-50 hover:text-amber-700'}`}>
                          <Gift size={14} />
                        </button>
                        <button type="button" onClick={() => removeLine(i)} className="rounded p-1 text-gray-400 hover:bg-rose-50 hover:text-rose-700" title="Remove">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Discount */}
        <details className="rounded-xl border border-gray-200 bg-white p-4" open={!!discountType}>
          <summary className="cursor-pointer text-sm font-semibold text-gray-900 inline-flex items-center gap-2">
            <Tag size={14} /> Discount {discountType && <span className="text-xs text-gray-500">— applied</span>}
          </summary>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Select label="Type" value={discountType} onChange={(e) => setDiscountType(e.target.value as any)}>  {/* eslint-disable-line @typescript-eslint/no-explicit-any */}
              <option value="">No discount</option>
              <option value="percent">Percent</option>
              <option value="fixed">Fixed amount</option>
            </Select>
            <NumberInput
              label={discountType === 'percent' ? 'Percent (%)' : 'Amount (৳)'}
              value={discountValue}
              onChange={setDiscountValue}
              min={0}
              max={discountType === 'percent' ? 100 : undefined}
            />
            <Input
              label="Reason"
              value={discountReason}
              onChange={(e) => setDiscountReason(e.target.value)}
              placeholder={discountType ? 'e.g. friend discount' : 'Add a reason'}
            />
          </div>
        </details>

        {/* Payments */}
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Payments</h3>
            <Button type="button" variant="outline" size="sm" onClick={addPayment} className="gap-1">
              <Plus size={12} /> Add method
            </Button>
          </div>
          {payments.map((p, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-3">
                <Select label="Method" value={p.method} onChange={(e) => patchPayment(i, { method: e.target.value as CoffeeShopPaymentMethod })}>
                  {PAYMENT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-3">
                <NumberInput label="Amount" value={p.amount} onChange={(v) => patchPayment(i, { amount: v })} min={0} prefix="৳" />
              </div>
              <div className="sm:col-span-5">
                <Input label="Reference" value={p.reference} onChange={(e) => patchPayment(i, { reference: e.target.value })} placeholder="Optional (txn ID, last-4, etc)" />
              </div>
              <div className="sm:col-span-1 flex items-end justify-end">
                {payments.length > 1 && (
                  <button type="button" onClick={() => removePayment(i)} className="rounded p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-700">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button type="button" onClick={syncSingleCash}
            className="text-[11px] text-stone-700 hover:underline">
            Sync cash payment to net amount
          </button>
        </div>

        {/* Notes */}
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <Input
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything worth remembering"
          />
        </div>
      </div>

      {/* RIGHT: sticky summary */}
      <div className="lg:sticky lg:top-4 lg:self-start space-y-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Bill summary</h3>
          <Row label="Subtotal"  value={formatBDT(totals.subtotal)} />
          {totals.comp > 0 && <Row label="Comp value (info)" value={formatBDT(totals.comp)} muted />}
          {totals.discountAmount > 0 && <Row label={`Discount${discountType === 'percent' ? ` (${discountValue}%)` : ''}`} value={`− ${formatBDT(totals.discountAmount)}`} tone="amber" />}
          <div className="border-t border-gray-200 pt-2">
            <Row label="Net" value={formatBDT(totals.net)} bold large />
          </div>
          <div className="border-t border-gray-200 pt-2 space-y-1">
            <Row label="Tendered" value={formatBDT(totals.tendered)} muted />
            <Row label="Balance"  value={totals.balance === 0 ? '—' : formatBDT(totals.balance)}
              tone={totals.balance === 0 ? 'ok' : 'rose'} bold />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="button"
          variant="primary"
          size="md"
          loading={pending}
          onClick={submit}
          className="w-full gap-1.5"
          disabled={lines.length === 0}
        >
          <Save size={14} /> {isEdit ? 'Save changes' : 'Save sale'}
        </Button>
      </div>
    </div>
  )
}

function Row({ label, value, bold, large, muted, tone }: {
  label: string; value: string; bold?: boolean; large?: boolean; muted?: boolean
  tone?: 'amber' | 'rose' | 'ok'
}) {
  const cls = [
    'flex justify-between items-baseline tabular-nums',
    large ? 'text-base' : 'text-sm',
    muted ? 'text-gray-500' : 'text-gray-900',
    tone === 'amber' ? 'text-amber-800' : '',
    tone === 'rose'  ? 'text-rose-700'  : '',
    tone === 'ok'    ? 'text-emerald-700' : '',
    bold ? 'font-semibold' : '',
  ].filter(Boolean).join(' ')
  return (
    <div className={cls}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}
