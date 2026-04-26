'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createDailyExpenses } from '@/lib/actions/expenses'
import { PAYMENT_METHOD_OPTIONS, CATEGORY_GROUP_BADGE } from '@/components/expenses/labels'
import { formatBDT } from '@/lib/formatters/currency'
import { toISODate } from '@/lib/formatters/dates'
import type {
  ExpenseCategoryRow, ExpensePayeeRow, PaymentMethod, PayeeType,
} from '@/lib/supabase/types'

interface DailyExpenseGridProps {
  categories: ExpenseCategoryRow[]
  payees:     ExpensePayeeRow[]
  defaultDate?: string
}

interface GridLine {
  /** Stable client-side key for React */
  key:         string
  category_id: string
  payee_id:    string | null
  description: string
  amount:      number
}

/**
 * One row per active category by default. Categories with `requires_description=true`
 * (Misc, Beverages, Housekeeping) get a "+ Add row" button so multiple entries fit
 * (matches the Excel's three "Others" columns naturally).
 */
export function DailyExpenseGrid({ categories, payees, defaultDate }: DailyExpenseGridProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)

  const [date,          setDate]          = useState(defaultDate ?? toISODate(new Date()))
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [notes,         setNotes]         = useState('')

  // Initialize one line per category in display_order
  const [lines, setLines] = useState<GridLine[]>(() =>
    categories.map((c, i) => ({
      key:         `${c.id}-init-${i}`,
      category_id: c.id,
      payee_id:    null,
      description: '',
      amount:      0,
    })),
  )

  const dayTotal = useMemo(
    () => lines.reduce((sum, l) => sum + (Number.isFinite(l.amount) ? l.amount : 0), 0),
    [lines],
  )

  /** Suggest a default payee when a category requires one — first matching by type. */
  function suggestPayee(category: ExpenseCategoryRow): string | null {
    if (!category.requires_payee) return null
    // Heuristic: groceries/raw_meat → first supplier, services → first contractor, etc.
    const slug = category.slug
    const lookup: Record<string, PayeeType> = {
      groceries:        'supplier',
      raw_meat:         'supplier',
      metal_work:       'contractor',
      contractor_work:  'contractor',
      paint_decor:      'contractor',
    }
    const wantedType = lookup[slug]
    if (!wantedType) return null
    return payees.find((p) => p.payee_type === wantedType)?.id ?? null
  }

  function addRow(categoryId: string) {
    const cat = categories.find((c) => c.id === categoryId)
    setLines((prev) => [
      ...prev,
      {
        key:         `${categoryId}-${Date.now()}`,
        category_id: categoryId,
        payee_id:    cat ? suggestPayee(cat) : null,
        description: '',
        amount:      0,
      },
    ])
  }

  function removeRow(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key))
  }

  function updateRow(key: string, patch: Partial<GridLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  }

  function handleSubmit() {
    setError(null)
    const submittable = lines.filter((l) => Number(l.amount) > 0)

    if (submittable.length === 0) {
      setError('Add at least one line with an amount > 0')
      return
    }

    // Per-category requirements: payee + description (zod can't enforce these
    // because they vary by category)
    const errors: string[] = []
    for (const l of submittable) {
      const cat = categories.find((c) => c.id === l.category_id)
      if (!cat) continue
      if (cat.requires_payee && !l.payee_id) {
        errors.push(`${cat.name}: payee is required`)
      }
      if (cat.requires_description && !l.description.trim()) {
        errors.push(`${cat.name}: description is required`)
      }
    }
    if (errors.length > 0) {
      setError(errors.join('\n'))
      return
    }

    const payload = submittable.map((l) => ({
      category_id: l.category_id,
      payee_id:    l.payee_id ?? null,
      description: l.description.trim() || null,
      amount:      Number(l.amount),
    }))

    startTransition(async () => {
      try {
        const result = await createDailyExpenses({
          expense_date:   date,
          payment_method: paymentMethod,
          notes:          notes.trim() || null,
          lines:          payload,
        })
        if (!result.success) {
          setError(result.error)
          return
        }
        // Filter the list view to just this date so the user can verify
        router.push(`/expenses?from=${date}&to=${date}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Top toolbar: date + default payment method + notes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <Input
          label="Date"
          type="date"
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Select
          label="Default Payment Method"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
        >
          {PAYMENT_METHOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
        <Input
          label="Daily Notes (optional)"
          placeholder="Applied to all lines…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Grid — one card per category, with possibly multiple lines for misc-style categories */}
      <div className="space-y-3">
        {categories.map((cat) => {
          const catLines = lines.filter((l) => l.category_id === cat.id)
          const subtotal = catLines.reduce((s, l) => s + (Number.isFinite(l.amount) ? l.amount : 0), 0)
          const filteredPayees = cat.requires_payee
            ? payees   // show all and let user pick — display_order keeps suppliers/contractors useful
            : payees

          return (
            <div key={cat.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      CATEGORY_GROUP_BADGE[cat.category_group]
                    }`}
                  >
                    {cat.name}
                  </span>
                  {cat.requires_description && (
                    <span className="text-[10px] text-gray-400 italic">multi-line allowed</span>
                  )}
                </div>
                <span className="text-xs font-mono text-gray-500 tabular-nums">
                  {subtotal > 0 ? formatBDT(subtotal) : ''}
                </span>
              </div>

              <div className="space-y-2">
                {catLines.map((line, idx) => (
                  <div key={line.key} className="grid grid-cols-12 items-center gap-2">
                    {cat.requires_payee ? (
                      <Select
                        value={line.payee_id ?? ''}
                        onChange={(e) => updateRow(line.key, { payee_id: e.target.value || null })}
                        className="col-span-4"
                      >
                        <option value="">Select payee…</option>
                        {filteredPayees.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Select>
                    ) : (
                      <div className="col-span-4 text-xs text-gray-400 italic px-2">No payee</div>
                    )}

                    {cat.requires_description ? (
                      <input
                        type="text"
                        value={line.description}
                        onChange={(e) => updateRow(line.key, { description: e.target.value })}
                        placeholder={idx === 0 ? 'Description…' : 'More details…'}
                        className="col-span-5 rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-200"
                      />
                    ) : (
                      <div className="col-span-5 text-xs text-gray-300 italic px-2">—</div>
                    )}

                    <div className="col-span-2">
                      <NumberInput
                        prefix="৳"
                        value={line.amount}
                        onChange={(v) => updateRow(line.key, { amount: v })}
                      />
                    </div>

                    <div className="col-span-1 flex justify-end">
                      {catLines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRow(line.key)}
                          className="flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                          title="Remove line"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {cat.requires_description && (
                  <button
                    type="button"
                    onClick={() => addRow(cat.id)}
                    className="mt-1 flex items-center gap-1.5 rounded-lg border border-dashed border-forest-400 bg-forest-50 px-2.5 py-1 text-xs font-medium text-forest-700 hover:bg-forest-100 transition-colors"
                  >
                    <Plus size={12} />
                    Add another {cat.name.toLowerCase()} line
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Day total */}
      <div className="flex items-center justify-end gap-4 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3">
        <span className="text-sm font-semibold text-rose-800">Day Total</span>
        <span className="font-mono text-lg font-bold text-rose-900 tabular-nums">{formatBDT(dayTotal)}</span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={pending} onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="button" variant="primary" loading={pending} onClick={handleSubmit}>
          Save All ({lines.filter((l) => l.amount > 0).length} lines)
        </Button>
      </div>
    </div>
  )
}
