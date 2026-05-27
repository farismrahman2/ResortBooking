'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { changeStage, markWon, markLost, markOnHold } from '@/lib/actions/crm'
import { STAGE_LABELS, STAGE_ORDER } from '@/lib/crm/stage-probabilities'
import { LOST_REASON_LABELS } from './labels'
import type { OpportunityStage, LostReason } from '@/lib/supabase/types-crm'

interface Props {
  oppId:       string
  currentStage: OpportunityStage
  estValue:    number
  eventDate:   string | null
}

type Mode = 'idle' | 'won' | 'lost' | 'hold'

export function OpportunityStageActions({ oppId, currentStage, estValue, eventDate }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('idle')

  // Won form
  const [actualValue, setActualValue] = useState(String(estValue || ''))
  const [wonDate, setWonDate] = useState(eventDate ?? new Date().toISOString().slice(0, 10))
  const [wonNotes, setWonNotes] = useState('')
  // Lost form
  const [lostReason, setLostReason] = useState<LostReason>('price')
  const [lostNotes, setLostNotes] = useState('')
  // Hold form
  const [resumeDate, setResumeDate] = useState('')

  function run(fn: () => Promise<{ success: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (!res.success) { setError(res.error ?? 'Failed'); return }
      setMode('idle'); router.refresh()
    })
  }

  function onSelectStage(stage: OpportunityStage) {
    if (stage === currentStage) return
    if (stage === 'won')  { setMode('won'); return }
    if (stage === 'lost') { setMode('lost'); return }
    if (stage === 'on_hold') { setMode('hold'); return }
    run(() => changeStage(oppId, stage))
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {mode === 'idle' && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-gray-500">Move to:</label>
          <select
            value={currentStage} disabled={pending}
            onChange={(e) => onSelectStage(e.target.value as OpportunityStage)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100"
          >
            {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
        </div>
      )}

      {mode === 'won' && (
        <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm font-semibold text-emerald-800">Mark Won</p>
          <p className="text-xs text-emerald-700">This will create a tentative booking the Reservations team will see.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">Actual value
              <input type="number" min="0" value={actualValue} onChange={(e) => setActualValue(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-emerald-300 px-2 py-1 text-sm" /></label>
            <label className="text-xs">Event date
              <input type="date" value={wonDate} onChange={(e) => setWonDate(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-emerald-300 px-2 py-1 text-sm" /></label>
          </div>
          <input type="text" placeholder="Notes for booking (optional)" value={wonNotes} onChange={(e) => setWonNotes(e.target.value)}
            className="w-full rounded-md border border-emerald-300 px-2 py-1 text-sm" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => run(() => markWon(oppId, { actualValue: Number(actualValue), eventDate: wonDate, notes: wonNotes.trim() || undefined }))} loading={pending}>Confirm Won</Button>
            <Button size="sm" variant="outline" onClick={() => setMode('idle')}>Cancel</Button>
          </div>
        </div>
      )}

      {mode === 'lost' && (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-800">Mark Lost</p>
          <select value={lostReason} onChange={(e) => setLostReason(e.target.value as LostReason)}
            className="w-full rounded-md border border-red-300 px-2 py-1 text-sm">
            {Object.entries(LOST_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="text" placeholder="Notes (optional)" value={lostNotes} onChange={(e) => setLostNotes(e.target.value)}
            className="w-full rounded-md border border-red-300 px-2 py-1 text-sm" />
          <div className="flex gap-2">
            <Button size="sm" variant="danger" onClick={() => run(() => markLost(oppId, lostReason, lostNotes.trim() || undefined))} loading={pending}>Confirm Lost</Button>
            <Button size="sm" variant="outline" onClick={() => setMode('idle')}>Cancel</Button>
          </div>
        </div>
      )}

      {mode === 'hold' && (
        <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
          <p className="text-sm font-semibold text-stone-800">Put On Hold</p>
          <label className="text-xs">Resume date (required)
            <input type="date" value={resumeDate} onChange={(e) => setResumeDate(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-stone-300 px-2 py-1 text-sm" /></label>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => resumeDate ? run(() => markOnHold(oppId, resumeDate)) : setError('Resume date required')} loading={pending}>Confirm Hold</Button>
            <Button size="sm" variant="outline" onClick={() => setMode('idle')}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
