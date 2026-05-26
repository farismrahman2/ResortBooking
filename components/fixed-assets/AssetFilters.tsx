'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import type { FaCategory, FaLocation } from '@/lib/supabase/types-fixed-assets'
import { CONDITION_LABELS, STATUS_LABELS } from './labels'

export function AssetFilters({ categories, locations }: { categories: FaCategory[]; locations: FaLocation[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const setParam = useCallback((k: string, v: string) => {
    const next = new URLSearchParams(params.toString())
    if (v) next.set(k, v); else next.delete(k)
    router.replace(`${pathname}?${next.toString()}`)
  }, [params, pathname, router])
  const sel = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200'

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <input type="search" placeholder="Search tag, name, serial…" defaultValue={params.get('search') ?? ''}
        onChange={(e) => setParam('search', e.target.value)} className={`min-w-[180px] flex-1 ${sel}`} />
      <select defaultValue={params.get('category') ?? ''} onChange={(e) => setParam('category', e.target.value)} className={sel}>
        <option value="">All categories</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
      </select>
      <select defaultValue={params.get('location') ?? ''} onChange={(e) => setParam('location', e.target.value)} className={sel}>
        <option value="">All locations</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.display_name}</option>)}
      </select>
      <select defaultValue={params.get('condition') ?? ''} onChange={(e) => setParam('condition', e.target.value)} className={sel}>
        <option value="">Any condition</option>
        {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select defaultValue={params.get('status') ?? 'active'} onChange={(e) => setParam('status', e.target.value)} className={sel}>
        <option value="">Any status</option>
        {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  )
}
