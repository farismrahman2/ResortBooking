'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { recordCountedQty, bulkMarkMatching, finalizeCount, cancelCount } from '@/lib/actions/inventory'
import { formatQty } from './labels'
import type { InvCountFull } from '@/lib/supabase/types-inventory'

export function CountSheet({ count }: { count: InvCountFull }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const readOnly = count.status !== 'in_progress'

  // Local mirror of counted values for snappy typing
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(count.lines.map((l) => [l.item_id, l.counted_qty != null ? String(l.counted_qty) : ''])),
  )

  function saveLine(itemId: string) {
    const raw = values[itemId]
    const qty = raw === '' ? null : Number(raw)
    if (qty != null && (isNaN(qty) || qty < 0)) return
    startTransition(async () => {
      const res = await recordCountedQty(count.id, itemId, qty)
      if (!res.success) setError(res.error)
    })
  }

  function run(fn: () => Promise<{ success: boolean; error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) { setError(res.error ?? 'Failed'); return }
      after?.()
      router.refresh()
    })
  }

  const countedSoFar = count.lines.filter((l) => l.counted_qty != null).length

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">{countedSoFar} / {count.lines.length} counted</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => run(() => bulkMarkMatching(count.id))} loading={pending}>
              Mark rest as matching
            </Button>
            <Button size="sm" onClick={() => run(() => finalizeCount(count.id))} loading={pending}>Finalize</Button>
            <Button variant="danger" size="sm" onClick={() => run(() => cancelCount(count.id))} loading={pending}>Cancel count</Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-4 py-2 font-medium text-right">System</th>
              <th className="px-4 py-2 font-medium text-right">Counted</th>
              <th className="px-4 py-2 font-medium text-right">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {count.lines.map((l) => {
              const countedNum = values[l.item_id] === '' ? null : Number(values[l.item_id])
              const variance = countedNum == null ? null : countedNum - l.system_qty
              return (
                <tr key={l.id}>
                  <td className="px-4 py-2">
                    <span className="font-medium text-gray-900">{l.item.name}</span>
                    <span className="ml-1 font-mono text-xs text-gray-400">{l.item.sku_code}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600">{formatQty(l.system_qty, l.item.unit_abbr)}</td>
                  <td className="px-4 py-2 text-right">
                    {readOnly ? (
                      <span className="tabular-nums">{l.counted_qty != null ? formatQty(l.counted_qty, l.item.unit_abbr) : '—'}</span>
                    ) : (
                      <input
                        type="number" step="0.001" min="0" inputMode="decimal"
                        value={values[l.item_id]}
                        onChange={(e) => setValues((v) => ({ ...v, [l.item_id]: e.target.value }))}
                        onBlur={() => saveLine(l.item_id)}
                        className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-200"
                      />
                    )}
                  </td>
                  <td className={`px-4 py-2 text-right tabular-nums ${variance && variance !== 0 ? (variance > 0 ? 'text-emerald-600' : 'text-red-600') : 'text-gray-400'}`}>
                    {variance == null ? '—' : (variance > 0 ? '+' : '') + formatQty(variance, l.item.unit_abbr)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
