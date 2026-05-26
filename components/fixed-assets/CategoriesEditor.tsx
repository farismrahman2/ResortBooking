'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { updateAssetCategory } from '@/lib/actions/fixed-assets'
import type { FaCategory } from '@/lib/supabase/types-fixed-assets'

export function CategoriesEditor({ categories }: { categories: FaCategory[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [draft, setDraft] = useState(() =>
    Object.fromEntries(categories.map((c) => [c.id, {
      life: String(c.default_useful_life_years), salvage: String(c.default_salvage_pct), desc: c.description ?? '',
    }])),
  )

  function save(id: string) {
    setError(null); setSavedId(null)
    const d = draft[id]
    startTransition(async () => {
      const res = await updateAssetCategory(id, {
        default_useful_life_years: Number(d.life), default_salvage_pct: Number(d.salvage), description: d.desc.trim() || null,
      })
      if (!res.success) { setError(res.error); return }
      setSavedId(id); router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Useful life (yrs)</th>
              <th className="px-4 py-2.5 font-medium">Salvage %</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {categories.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2 font-medium text-gray-800">{c.display_name}</td>
                <td className="px-4 py-2">
                  <input type="number" min="1" value={draft[c.id].life}
                    onChange={(e) => setDraft((p) => ({ ...p, [c.id]: { ...p[c.id], life: e.target.value } }))}
                    className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none" />
                </td>
                <td className="px-4 py-2">
                  <input type="number" min="0" max="100" step="0.5" value={draft[c.id].salvage}
                    onChange={(e) => setDraft((p) => ({ ...p, [c.id]: { ...p[c.id], salvage: e.target.value } }))}
                    className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-zinc-500 focus:outline-none" />
                </td>
                <td className="px-4 py-2">
                  <Button size="sm" onClick={() => save(c.id)} loading={pending}>Save</Button>
                  {savedId === c.id && <span className="ml-2 text-xs text-emerald-600">Saved</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
