'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { DateRangePicker } from '@/components/ui/DateRangePicker'
import { Select } from '@/components/ui/Select'
import { PAYMENT_METHOD_OPTIONS } from '@/components/expenses/labels'
import { Search } from 'lucide-react'
import type { ExpenseCategoryRow, ExpensePayeeRow } from '@/lib/supabase/types'

interface ExpenseFiltersProps {
  from:        string
  to:          string
  categoryId:  string
  payeeId:     string
  paymentMethod: string
  search:      string
  categories:  ExpenseCategoryRow[]
  payees:      ExpensePayeeRow[]
}

export function ExpenseFilters({
  from, to, categoryId, payeeId, paymentMethod, search, categories, payees,
}: ExpenseFiltersProps) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const updateParam = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === '') params.delete(key)
      else                            params.set(key, val)
    }
    router.push(`/expenses?${params.toString()}`)
  }, [router, searchParams])

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Date range</label>
        <DateRangePicker
          from={from}
          to={to}
          onChange={(range) => updateParam({ from: range.from, to: range.to })}
          presets
        />
      </div>

      <div className="min-w-[180px]">
        <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
        <Select
          value={categoryId}
          onChange={(e) => updateParam({ categoryId: e.target.value || null })}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
      </div>

      <div className="min-w-[160px]">
        <label className="mb-1 block text-xs font-medium text-gray-600">Payee</label>
        <Select
          value={payeeId}
          onChange={(e) => updateParam({ payeeId: e.target.value || null })}
        >
          <option value="">All payees</option>
          {payees.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>

      <div className="min-w-[140px]">
        <label className="mb-1 block text-xs font-medium text-gray-600">Payment</label>
        <Select
          value={paymentMethod}
          onChange={(e) => updateParam({ paymentMethod: e.target.value || null })}
        >
          <option value="">All methods</option>
          {PAYMENT_METHOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </div>

      <div className="min-w-[200px] flex-1">
        <label className="mb-1 block text-xs font-medium text-gray-600">Search</label>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            defaultValue={search}
            placeholder="Description or reference..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateParam({ search: (e.target as HTMLInputElement).value || null })
              }
            }}
            className="w-full rounded-lg border border-gray-300 bg-white pl-8 pr-3 py-2 text-sm focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-200"
          />
        </div>
      </div>
    </div>
  )
}
