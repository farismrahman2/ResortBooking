'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import type { InvCategory, InvSupplier } from '@/lib/supabase/types-inventory'

interface Props {
  categories: InvCategory[]
  suppliers:  InvSupplier[]
}

export function ItemFilters({ categories, suppliers }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const setParam = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    router.replace(`${pathname}?${next.toString()}`)
  }, [params, pathname, router])

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="min-w-[180px] flex-1">
        <input
          type="search"
          placeholder="Search name or SKU…"
          defaultValue={params.get('search') ?? ''}
          onChange={(e) => setParam('search', e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
        />
      </div>

      <select
        defaultValue={params.get('category') ?? ''}
        onChange={(e) => setParam('category', e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
      >
        <option value="">All categories</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
      </select>

      <select
        defaultValue={params.get('supplier') ?? ''}
        onChange={(e) => setParam('supplier', e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
      >
        <option value="">All suppliers</option>
        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      <label className="flex cursor-pointer items-center gap-2 py-2 text-sm text-gray-700">
        <input
          type="checkbox"
          defaultChecked={params.get('low') === '1'}
          onChange={(e) => setParam('low', e.target.checked ? '1' : '')}
          className="accent-teal-600"
        />
        Low stock only
      </label>
    </div>
  )
}
