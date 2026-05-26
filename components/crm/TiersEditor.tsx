'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { updateTier } from '@/lib/actions/crm'
import type { CrmTier } from '@/lib/supabase/types-crm'

export function TiersEditor({ tiers }: { tiers: CrmTier[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(tiers.map((t) => [t.id, { pct: String(t.default_discount_pct), desc: t.description ?? '' }])),
  )

  function save(id: string) {
    setError(null); setSavedId(null)
    const d = draft[id]
    startTransition(async () => {
      const res = await updateTier(id, { default_discount_pct: Number(d.pct), description: d.desc.trim() || null })
      if (!res.success) { setError(res.error); return }
      setSavedId(id); router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {tiers.map((t) => (
        <div key={t.id} className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">{t.display_name}</h3>
            <span className="font-mono text-xs text-gray-400">tier {t.slug.toUpperCase()}</span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
            <label className="text-sm">
              <span className="field-label">Discount %</span>
              <input type="number" min="0" max="100" step="0.5" value={draft[t.id].pct}
                onChange={(e) => setDraft((p) => ({ ...p, [t.id]: { ...p[t.id], pct: e.target.value } }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100" />
            </label>
            <label className="text-sm">
              <span className="field-label">Description</span>
              <input type="text" value={draft[t.id].desc}
                onChange={(e) => setDraft((p) => ({ ...p, [t.id]: { ...p[t.id], desc: e.target.value } }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100" />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={() => save(t.id)} loading={pending}>Save</Button>
            {savedId === t.id && <span className="text-xs text-emerald-600">Saved</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
