'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Building2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { processVisitToCrm } from '@/lib/actions/field-visits'
import { STAGE_LABELS, STAGE_ORDER } from '@/lib/crm/stage-probabilities'
import type { CrmTier } from '@/lib/supabase/types-crm'
import { safeCall } from '@/lib/actions/safe-call'

interface Match { id: string; company_name: string; account_code: string }

export function ProcessToCrmPanel({
  visitId, status, organisationName, suggestions, tiers, canWrite, accountId,
}: {
  visitId: string
  status: string
  organisationName: string | null
  suggestions: Match[]
  tiers: CrmTier[]
  canWrite: boolean
  accountId: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode]   = useState<'link' | 'new'>(suggestions.length ? 'link' : 'new')
  const [picked, setPicked] = useState(suggestions[0]?.id ?? '')
  const [stage, setStage] = useState('contacted')
  const [tier, setTier]   = useState<'a' | 'b' | 'c'>('b')

  if (!canWrite) return null

  if (status === 'processed') {
    return (
      <div className="rounded-xl border border-green-300 bg-green-50 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-green-900">
          <CheckCircle2 size={16} /> Processed into the CRM
        </p>
        {accountId && (
          <a href={`/crm/accounts/${accountId}`} className="mt-1 inline-block text-xs font-medium text-green-800 underline">
            Open the account →
          </a>
        )}
      </div>
    )
  }

  if (status === 'draft') {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        This visit is still a draft. Submit it before processing it into the CRM.
      </div>
    )
  }

  if (status === 'void') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        This visit is void.
      </div>
    )
  }

  function handleProcess() {
    setError(null)
    startTransition(async () => {
      const r = await safeCall(() => processVisitToCrm(visitId, {
        accountId: mode === 'link' ? picked : null,
        createNew: mode === 'new',
        stage, tier,
      }))
      if (!r.success) { setError(r.error); return }
      router.refresh()
    })
  }


  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/50 p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
        <Building2 size={15} /> Process to CRM
      </p>

      <div className="flex gap-2">
        <button
          type="button" onClick={() => setMode('link')} disabled={!suggestions.length}
          className={cn('min-h-[40px] flex-1 rounded-lg border px-3 text-xs font-semibold disabled:opacity-40',
            mode === 'link' ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-gray-300 bg-white text-gray-700')}
        >
          Link existing
        </button>
        <button
          type="button" onClick={() => setMode('new')}
          className={cn('min-h-[40px] flex-1 rounded-lg border px-3 text-xs font-semibold',
            mode === 'new' ? 'border-amber-500 bg-amber-100 text-amber-900' : 'border-gray-300 bg-white text-gray-700')}
        >
          Create new
        </button>
      </div>

      {mode === 'link' ? (
        <select
          value={picked} onChange={(e) => setPicked(e.target.value)}
          className="min-h-[40px] w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm"
        >
          {suggestions.map((s) => <option key={s.id} value={s.id}>{s.company_name} ({s.account_code})</option>)}
        </select>
      ) : (
        <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
          Creates <strong>{organisationName ?? '(no name)'}</strong> as a new CRM account, carrying over
          the named contacts from this visit.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-gray-600">Pipeline stage</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)}
            className="min-h-[40px] w-full rounded-lg border border-gray-300 bg-white px-2 text-sm">
            {STAGE_ORDER.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-medium text-gray-600">Discount tier</span>
          <select value={tier} onChange={(e) => setTier(e.target.value as 'a' | 'b' | 'c')}
            className="min-h-[40px] w-full rounded-lg border border-gray-300 bg-white px-2 text-sm">
            {tiers.map((t) => <option key={t.slug} value={t.slug}>{t.display_name}</option>)}
          </select>
        </label>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />{error}
        </p>
      )}

      <button
        type="button" onClick={handleProcess} disabled={pending || (mode === 'link' && !picked)}
        className="min-h-[44px] w-full rounded-xl bg-amber-600 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? 'Processing…' : 'Mark processed'}
      </button>

    </div>
  )
}
