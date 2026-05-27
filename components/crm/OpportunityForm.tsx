'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createOpportunity, updateOpportunity } from '@/lib/actions/crm'
import type { OpportunityFormInput } from '@/lib/validators/crm'
import type { CrmOpportunity, CrmContact, EventType } from '@/lib/supabase/types-crm'
import { EVENT_TYPE_LABELS } from './labels'

interface OwnerOption { id: string; name: string }

interface Props {
  accountId:     string
  owners:        OwnerOption[]
  contacts:      CrmContact[]
  defaultOwnerId?: string
  opportunity?:  CrmOpportunity
}

export function OpportunityForm({ accountId, owners, contacts, defaultOwnerId, opportunity }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    opportunity_name:    opportunity?.opportunity_name ?? '',
    owner_user_id:       opportunity?.owner_user_id ?? defaultOwnerId ?? owners[0]?.id ?? '',
    primary_contact_id:  opportunity?.primary_contact_id ?? '',
    event_type:          (opportunity?.event_type ?? 'training') as EventType,
    pax:                 opportunity?.pax != null ? String(opportunity.pax) : '',
    est_value:           opportunity?.est_value != null ? String(opportunity.est_value) : '',
    expected_event_date: opportunity?.expected_event_date ?? '',
    probability_pct:     opportunity?.probability_pct != null ? String(opportunity.probability_pct) : '',
    next_action:         opportunity?.next_action ?? '',
    notes:               opportunity?.notes ?? '',
  })
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })) }

  function submit() {
    setError(null)
    const payload: OpportunityFormInput = {
      account_id:          accountId,
      owner_user_id:       form.owner_user_id,
      primary_contact_id:  form.primary_contact_id || null,
      opportunity_name:    form.opportunity_name.trim(),
      event_type:          form.event_type,
      pax:                 form.pax === '' ? null : Number(form.pax),
      est_value:           form.est_value === '' ? 0 : Number(form.est_value),
      expected_event_date: form.expected_event_date || null,
      next_action:         form.next_action.trim() || null,
      notes:               form.notes.trim() || null,
    }
    startTransition(async () => {
      const res = opportunity
        ? await updateOpportunity(opportunity.id, { ...payload, probability_pct: form.probability_pct === '' ? undefined : Number(form.probability_pct) })
        : await createOpportunity(payload)
      if (!res.success) { setError(res.error); return }
      router.push(opportunity ? `/crm/opportunities/${opportunity.id}` : '/crm/pipeline')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <Input label="Opportunity name" required value={form.opportunity_name} onChange={(e) => set('opportunity_name', e.target.value)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Owner" required value={form.owner_user_id} onChange={(e) => set('owner_user_id', e.target.value)}
          options={owners.map((o) => ({ value: o.id, label: o.name }))} />
        <Select label="Event type" value={form.event_type} onChange={(e) => set('event_type', e.target.value as EventType)}
          options={Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Pax" type="number" min="1" value={form.pax} onChange={(e) => set('pax', e.target.value)} />
        <Input label="Estimated value (BDT)" type="number" min="0" value={form.est_value} onChange={(e) => set('est_value', e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Expected event date" type="date" value={form.expected_event_date} onChange={(e) => set('expected_event_date', e.target.value)} />
        {opportunity && (
          <Input label="Probability %" type="number" min="0" max="100" value={form.probability_pct}
            onChange={(e) => set('probability_pct', e.target.value)} hint="Manual override is preserved across stage changes" />
        )}
      </div>
      <Select label="Primary contact" value={form.primary_contact_id} onChange={(e) => set('primary_contact_id', e.target.value)}>
        <option value="">—</option>
        {contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name}{c.designation ? ` (${c.designation})` : ''}</option>)}
      </Select>
      <Input label="Next action" value={form.next_action} onChange={(e) => set('next_action', e.target.value)} />
      <Textarea label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      <div className="flex gap-2 pt-1">
        <Button onClick={submit} loading={pending} disabled={!form.opportunity_name.trim() || !form.owner_user_id}>
          {opportunity ? 'Save changes' : 'Create opportunity'}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  )
}
