'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatBDT } from '@/lib/formatters/currency'
import { setRevenueDisplayPct } from '@/lib/actions/revenue-display'
import { toast } from '@/lib/toast/store'

export interface MonthRow { month: string; pct: number; own: boolean; real: number; shown: number; bookings: number }

const label = (m: string) => new Date(`${m}T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

export function RevenueDisplayClient({ rows, thisMonth }: { rows: MonthRow[]; thisMonth: string }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [pending, start] = useTransition()

  function save(month: string) {
    const pct = Number(value)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) { toast.error('Enter a percentage from 0 to 100'); return }
    start(async () => {
      const r = await setRevenueDisplayPct({ month, pct })
      if (!r.success) { toast.error(r.error); return }
      toast.success(`${label(month)}: staff now see ${pct}% of revenue`)
      setEditing(null)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
        Everyone except the admin sees <b>Revenue this month</b> on the dashboard as the real room-booking revenue × the month&apos;s
        percentage. A month without its own percentage uses the latest earlier one. Revenue reports and analytics are admin only.
        Payroll and service charge always use the real figures.
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-4 py-2">Month</th>
              <th className="px-4 py-2 text-right">Real</th>
              <th className="px-4 py-2 text-right">Shown %</th>
              <th className="px-4 py-2 text-right">Staff see</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month} className={`border-t border-gray-100 ${r.month === thisMonth ? 'bg-forest-50/40' : ''}`}>
                <td className="px-4 py-2.5 text-gray-800">
                  {label(r.month)}{r.month === thisMonth && <span className="ml-1.5 rounded bg-forest-100 px-1.5 text-[10px] font-semibold text-forest-800">This month</span>}
                  <div className="text-[11px] text-gray-400">{r.bookings} booking{r.bookings === 1 ? '' : 's'}</div>
                </td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-600">{formatBDT(r.real)}</td>
                <td className="px-4 py-2.5 text-right">
                  {editing === r.month ? (
                    <span className="inline-flex items-center gap-1">
                      <input autoFocus inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
                        onKeyDown={(e) => { if (e.key === 'Enter') save(r.month); if (e.key === 'Escape') setEditing(null) }}
                        className="w-16 rounded border border-gray-300 px-2 py-1 text-right font-mono" />%
                    </span>
                  ) : (
                    <span className="font-mono">{r.pct}%{!r.own && <span className="ml-1 text-[10px] text-gray-400" title="Carried over from an earlier month">(carried)</span>}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-900">{formatBDT(r.shown)}</td>
                <td className="px-4 py-2.5 text-right">
                  {editing === r.month ? (
                    <span className="inline-flex gap-1">
                      <button type="button" disabled={pending} onClick={() => save(r.month)} className="rounded bg-forest-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60">Save</button>
                      <button type="button" onClick={() => setEditing(null)} className="rounded border border-gray-300 px-2.5 py-1 text-xs">Cancel</button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => { setEditing(r.month); setValue(String(r.pct)) }} className="text-xs font-medium text-forest-700 hover:underline">Set %</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
