'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { recordAuditLine, finalizeAudit, cancelAudit } from '@/lib/actions/fixed-assets'
import type { FaAuditFull, FaLocation, AssetCondition } from '@/lib/supabase/types-fixed-assets'
import { CONDITION_LABELS } from './labels'

export function AuditSheet({ audit, locations }: { audit: FaAuditFull; locations: FaLocation[] }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [markLost, setMarkLost] = useState(false)
  const readOnly = audit.status !== 'in_progress'

  function mark(assetId: string, found: boolean, foundLoc: string, foundCond: string) {
    setError(null)
    startTransition(async () => {
      const res = await recordAuditLine(audit.id, assetId, {
        found, found_at_location_id: foundLoc || null, found_condition: foundCond || null,
      })
      if (!res.success) setError(res.error)
      else router.refresh()
    })
  }
  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) { setError(res.error ?? 'Failed'); return }
      router.refresh()
    })
  }

  const verified = audit.lines.filter((l) => l.found != null).length

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">{verified} / {audit.lines.length} verified</p>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={markLost} onChange={(e) => setMarkLost(e.target.checked)} className="accent-zinc-600" />
              Mark not-found as lost on finalize
            </label>
            <Button size="sm" onClick={() => run(() => finalizeAudit(audit.id, markLost))} loading={pending}>Finalize</Button>
            <Button size="sm" variant="danger" onClick={() => run(() => cancelAudit(audit.id))} loading={pending}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Asset</th>
              <th className="px-3 py-2 font-medium">Expected loc.</th>
              <th className="px-3 py-2 font-medium">Found?</th>
              <th className="px-3 py-2 font-medium">Found at</th>
              <th className="px-3 py-2 font-medium">Condition</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {audit.lines.map((l) => <AuditRow key={l.id} line={l} locations={locations} readOnly={readOnly} pending={pending} onMark={mark} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AuditRow({ line, locations, readOnly, pending, onMark }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  line: FaAuditFull['lines'][number]; locations: FaLocation[]; readOnly: boolean; pending: boolean
  onMark: (assetId: string, found: boolean, loc: string, cond: string) => void
}) {
  const [foundLoc, setFoundLoc] = useState(line.found_at_location_id ?? line.expected_location_id ?? '')
  const [foundCond, setFoundCond] = useState<string>(line.found_condition ?? line.current_condition ?? 'good')

  return (
    <tr className={line.found === false ? 'bg-red-50' : line.found === true ? 'bg-emerald-50/40' : ''}>
      <td className="px-3 py-2">
        <span className="font-medium text-gray-900">{line.asset_name}</span>
        <span className="ml-1 font-mono text-xs text-gray-400">{line.asset_tag}</span>
      </td>
      <td className="px-3 py-2 text-gray-600">{line.expected_location ?? '—'}</td>
      <td className="px-3 py-2">
        {readOnly ? (line.found == null ? '—' : line.found ? 'Yes' : 'No') : (
          <div className="flex gap-1">
            <button disabled={pending} onClick={() => onMark(line.asset_id, true, foundLoc, foundCond)}
              className={`rounded px-2 py-0.5 text-xs ${line.found === true ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Found</button>
            <button disabled={pending} onClick={() => onMark(line.asset_id, false, '', '')}
              className={`rounded px-2 py-0.5 text-xs ${line.found === false ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Missing</button>
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        {!readOnly ? (
          <select value={foundLoc} onChange={(e) => setFoundLoc(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
            <option value="">—</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.display_name}</option>)}
          </select>
        ) : (line.found_at_location_id ? locations.find((l) => l.id === line.found_at_location_id)?.display_name ?? '—' : '—')}
      </td>
      <td className="px-3 py-2">
        {!readOnly ? (
          <select value={foundCond} onChange={(e) => setFoundCond(e.target.value as AssetCondition)} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
            {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        ) : (line.found_condition ? CONDITION_LABELS[line.found_condition] : '—')}
      </td>
    </tr>
  )
}
