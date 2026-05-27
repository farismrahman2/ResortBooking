'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatQty } from './labels'
import type { InvItemWithStock } from '@/lib/supabase/types-inventory'

interface Group {
  supplierName: string
  items:        InvItemWithStock[]
}

export function LowStockClient({ groups }: { groups: Group[] }) {
  function downloadCsv() {
    const lines: string[] = ['Supplier,SKU,Item,In stock,Reorder point,Suggested order,Unit']
    for (const g of groups) {
      for (const it of g.items) {
        const suggested = it.par_level != null ? Math.max(0, it.par_level - it.current_stock) : ''
        lines.push([
          `"${g.supplierName}"`,
          it.sku_code,
          `"${it.name}"`,
          it.current_stock,
          it.reorder_point ?? '',
          suggested,
          it.unit?.abbreviation ?? '',
        ].join(','))
      }
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `shopping-list-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const total = groups.reduce((s, g) => s + g.items.length, 0)

  if (total === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">Nothing below reorder point.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={downloadCsv}><Download size={13} className="mr-1.5" /> Shopping list (CSV)</Button>
      </div>
      {groups.map((g) => (
        <div key={g.supplierName} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-800">{g.supplierName}</div>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium text-right">In stock</th>
                <th className="px-4 py-2 font-medium text-right">Reorder</th>
                <th className="px-4 py-2 font-medium text-right">Suggested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {g.items.map((it) => (
                <tr key={it.id}>
                  <td className="px-4 py-2">
                    <span className="font-medium text-gray-900">{it.name}</span>
                    <span className="ml-1 font-mono text-xs text-gray-400">{it.sku_code}</span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-700">{formatQty(it.current_stock, it.unit?.abbreviation)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-500">{it.reorder_point != null ? formatQty(it.reorder_point, it.unit?.abbreviation) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-gray-900">
                    {it.par_level != null ? formatQty(Math.max(0, it.par_level - it.current_stock), it.unit?.abbreviation) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
