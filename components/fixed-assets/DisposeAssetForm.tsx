'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { disposeAsset } from '@/lib/actions/fixed-assets'
import { computeDepreciation } from '@/lib/fixed-assets/depreciation'
import { DISPOSAL_METHOD_LABELS } from './labels'
import { formatBDT } from '@/lib/formatters/currency'
import type { DisposalMethod } from '@/lib/supabase/types-fixed-assets'

interface Props {
  assetId:               string
  assetTag:              string
  acquisitionCost:       number
  salvageValue:          number
  usefulLifeYears:       number
  depreciationStartDate: string
}

export function DisposeAssetForm({ assetId, assetTag, acquisitionCost, salvageValue, usefulLifeYears, depreciationStartDate }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [method, setMethod] = useState<DisposalMethod>('sold')
  const [proceeds, setProceeds] = useState('')
  const [notes, setNotes] = useState('')

  const nbv = computeDepreciation({
    acquisitionCost, salvageValue, usefulLifeYears,
    depreciationStartDate: new Date(depreciationStartDate + 'T00:00:00'),
    asOfDate: new Date(date + 'T00:00:00'),
  }).netBookValue
  const proceedsNum = Number(proceeds) || 0
  const gainLoss = Math.round((proceedsNum - nbv) * 100) / 100

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await disposeAsset({
        asset_id: assetId, disposal_date: date, disposal_method: method,
        disposal_proceeds: proceeds === '' ? null : proceedsNum, disposal_notes: notes.trim() || null,
      })
      if (!res.success) { setError(res.error); return }
      router.push(`/fixed-assets/assets/${assetId}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value as DisposalMethod)}
          options={Object.entries(DISPOSAL_METHOD_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
        <Input label="Disposal date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Input label="Proceeds (BDT)" type="number" min="0" value={proceeds} onChange={(e) => setProceeds(e.target.value)}
        hint={method === 'sold' || method === 'traded_in' ? 'Required for sold / traded in' : 'Optional'} />
      <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
        <div className="flex justify-between py-1"><span className="text-gray-500">Net book value at disposal</span><span className="tabular-nums font-medium">{formatBDT(nbv)}</span></div>
        <div className="flex justify-between py-1"><span className="text-gray-500">Proceeds</span><span className="tabular-nums font-medium">{formatBDT(proceedsNum)}</span></div>
        <div className="mt-1 flex justify-between border-t border-gray-200 py-1">
          <span className="font-semibold text-gray-700">{gainLoss >= 0 ? 'Gain' : 'Loss'}</span>
          <span className={`tabular-nums font-bold ${gainLoss >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{formatBDT(Math.abs(gainLoss))}</span>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        This marks {assetTag} as disposed and stops its depreciation. The capitalized expense is left untouched.
      </div>
      <div className="flex gap-2">
        <Button variant="danger" onClick={submit} loading={pending}>Confirm disposal</Button>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  )
}
