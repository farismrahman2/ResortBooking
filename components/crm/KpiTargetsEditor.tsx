'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setKpiTarget } from '@/lib/actions/crm'
import { KPI_METRICS, KPI_METRIC_LABELS, type KpiMetric } from '@/lib/crm/kpi-metrics'

interface Props {
  userId:   string
  existing: Record<string, number>   // key `${metric}:${period}` → value
}

const PERIODS: (30 | 60 | 90)[] = [30, 60, 90]

export function KpiTargetsEditor({ userId, existing }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {}
    for (const m of KPI_METRICS) for (const p of PERIODS) {
      const k = `${m}:${p}`
      d[k] = existing[k] != null ? String(existing[k]) : ''
    }
    return d
  })

  function save(metric: KpiMetric, period: 30 | 60 | 90) {
    const key = `${metric}:${period}`
    const raw = draft[key]
    if (raw === '') return
    setError(null); setSavedKey(null)
    startTransition(async () => {
      const res = await setKpiTarget(userId, metric, period, Number(raw))
      if (!res.success) { setError(res.error); return }
      setSavedKey(key); router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Metric</th>
              {PERIODS.map((p) => <th key={p} className="px-4 py-2.5 text-center font-medium">Day {p}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {KPI_METRICS.map((m) => (
              <tr key={m}>
                <td className="px-4 py-2 font-medium text-gray-800">{KPI_METRIC_LABELS[m]}</td>
                {PERIODS.map((p) => {
                  const key = `${m}:${p}`
                  return (
                    <td key={p} className="px-4 py-2 text-center">
                      <input
                        type="number" min="0" value={draft[key]} disabled={pending}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                        onBlur={() => save(m, p)}
                        className={`w-24 rounded-md border px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-amber-200 ${savedKey === key ? 'border-emerald-400' : 'border-gray-300 focus:border-amber-500'}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">Values save when you leave a field.</p>
    </div>
  )
}
