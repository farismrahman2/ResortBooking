'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Save } from 'lucide-react'
import { NumberInput } from '@/components/ui/NumberInput'
import { Button } from '@/components/ui/Button'
import { upsertBudget } from '@/lib/actions/expenses'
import { formatBDT } from '@/lib/formatters/currency'
import { CATEGORY_GROUP_BADGE } from '@/components/expenses/labels'
import type {
  ExpenseCategoryRow,
  BudgetPeriodType,
} from '@/lib/supabase/types'
import type { BudgetVsActualRow } from '@/lib/queries/expenses'

interface BudgetManagerProps {
  period:       BudgetPeriodType
  periodStart:  string
  periodLabel:  string
  categories:   ExpenseCategoryRow[]
  vsActual:     BudgetVsActualRow[]
}

interface RowState {
  category_id: string | null   // null = overall
  budget:      number          // 0 means no budget set
  budget_id:   string | null   // present when an existing budget row backs this entry
  actual:      number
}

export function BudgetManager({ period, periodStart, periodLabel, categories, vsActual }: BudgetManagerProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)

  // Build initial editable state: "Overall" + one row per category, prefilled
  // from vsActual when present.
  const initial: RowState[] = useMemo(() => {
    const byCategory = new Map<string | null, BudgetVsActualRow>()
    for (const row of vsActual) byCategory.set(row.category_id, row)

    const rows: RowState[] = [
      {
        category_id: null,
        budget:      byCategory.get(null)?.budget ?? 0,
        budget_id:   null,   // we don't have the id from getBudgetVsActual; the action upserts by (cat, type, start)
        actual:      byCategory.get(null)?.actual ?? 0,
      },
    ]
    for (const c of categories) {
      const v = byCategory.get(c.id)
      rows.push({
        category_id: c.id,
        budget:      v?.budget ?? 0,
        budget_id:   null,
        actual:      v?.actual ?? 0,
      })
    }
    return rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, periodStart])

  const [rowState, setRowState] = useState<RowState[]>(initial)

  function setBudget(idx: number, value: number) {
    setRowState((prev) => prev.map((r, i) => (i === idx ? { ...r, budget: value } : r)))
  }

  function categoryName(category_id: string | null): string {
    if (category_id === null) return 'Overall (all categories)'
    return categories.find((c) => c.id === category_id)?.name ?? '—'
  }

  function categoryGroup(category_id: string | null) {
    if (category_id === null) return null
    return categories.find((c) => c.id === category_id)?.category_group ?? null
  }

  async function handleSave(idx: number) {
    const row = rowState[idx]
    setError(null)
    startTransition(async () => {
      if (row.budget <= 0) {
        // Treat 0 as "remove budget if it exists"
        // We don't have the row's id — but upsertBudget would fail validation.
        // For v1, require a positive amount; clearing is via the Delete button.
        setError('Enter a positive amount or use Delete to clear.')
        return
      }
      const result = await upsertBudget({
        category_id:  row.category_id,
        period_type:  period,
        period_start: periodStart,
        amount:       row.budget,
      })
      if (!result.success) { setError(result.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Budget period: <span className="font-medium text-gray-700">{periodLabel}</span>
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 text-right font-medium">Budget</th>
              <th className="px-4 py-2.5 text-right font-medium">Actual</th>
              <th className="px-4 py-2.5 font-medium" style={{ width: '30%' }}>Progress</th>
              <th className="px-4 py-2.5 text-right font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rowState.map((row, idx) => {
              const grp     = categoryGroup(row.category_id)
              const isOver  = row.budget > 0 && row.actual > row.budget
              const pct     = row.budget > 0 ? Math.min(1.5, row.actual / row.budget) : 0
              const barCls  = isOver ? 'bg-red-500' : pct > 0.85 ? 'bg-amber-500' : 'bg-emerald-500'
              return (
                <tr key={row.category_id ?? 'overall'} className="hover:bg-gray-50/40">
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    {row.category_id === null ? (
                      <span className="inline-flex items-center rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-800">
                        ⭐ Overall
                      </span>
                    ) : (
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          grp ? CATEGORY_GROUP_BADGE[grp] : 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        {categoryName(row.category_id)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-block w-32">
                      <NumberInput
                        prefix="৳"
                        value={row.budget}
                        onChange={(v) => setBudget(idx, v)}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-gray-800">
                    {formatBDT(row.actual)}
                  </td>
                  <td className="px-4 py-2.5">
                    {row.budget > 0 ? (
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 rounded-full bg-gray-200 overflow-hidden">
                          <div
                            className={`h-full ${barCls} transition-all`}
                            style={{ width: `${Math.min(100, pct * 100)}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-mono tabular-nums w-12 text-right ${isOver ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                          {Math.round(pct * 100)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300 italic">No budget</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      variant="primary"
                      size="sm"
                      loading={pending}
                      onClick={() => handleSave(idx)}
                      className="gap-1"
                    >
                      <Save size={11} />
                      Save
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <p className="text-[10px] text-gray-400 italic">
        Budgets are checked against non-draft expenses with <code className="font-mono">expense_date</code> in the period.
      </p>
    </div>
  )
}
