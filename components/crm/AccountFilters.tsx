'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import type { CrmSector, CrmTier } from '@/lib/supabase/types-crm'
import { STATUS_LABELS } from './labels'

interface Props {
  sectors: CrmSector[]
  tiers:   CrmTier[]
}

export function AccountFilters({ sectors, tiers }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const setParam = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(key, value); else next.delete(key)
    router.replace(`${pathname}?${next.toString()}`)
  }, [params, pathname, router])

  const sel = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100'

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <input
        type="search" placeholder="Search company or code…"
        defaultValue={params.get('search') ?? ''} onChange={(e) => setParam('search', e.target.value)}
        className={`min-w-[180px] flex-1 ${sel}`}
      />
      <select defaultValue={params.get('status') ?? ''} onChange={(e) => setParam('status', e.target.value)} className={sel}>
        <option value="">All statuses</option>
        {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select defaultValue={params.get('sector') ?? ''} onChange={(e) => setParam('sector', e.target.value)} className={sel}>
        <option value="">All sectors</option>
        {sectors.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
      </select>
      <select defaultValue={params.get('tier') ?? ''} onChange={(e) => setParam('tier', e.target.value)} className={sel}>
        <option value="">All tiers</option>
        {tiers.map((t) => <option key={t.id} value={t.id}>{t.display_name}</option>)}
      </select>
      <label className="flex cursor-pointer items-center gap-1.5 text-sm text-gray-600">
        <input
          type="checkbox"
          defaultChecked={params.get('inactive') === '1'}
          onChange={(e) => setParam('inactive', e.target.checked ? '1' : '')}
          className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
        />
        Show inactive
      </label>
    </div>
  )
}
