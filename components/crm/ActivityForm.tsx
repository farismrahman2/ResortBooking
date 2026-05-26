'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createActivity } from '@/lib/actions/crm'
import type { ActivityFormInput } from '@/lib/validators/crm'
import type { CrmContact, CrmOpportunity, ActivityType, ActivityOutcome } from '@/lib/supabase/types-crm'
import { ACTIVITY_TYPE_LABELS } from './labels'

interface Props {
  accountId:     string
  contacts:      CrmContact[]
  opportunities: Pick<CrmOpportunity, 'id' | 'opportunity_name'>[]
  onDone?:       () => void
}

export function ActivityForm({ accountId, contacts, opportunities, onDone }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    activity_type:  'call' as ActivityType,
    activity_date:  new Date().toISOString().slice(0, 10),
    subject:        '',
    opportunity_id: opportunities[0]?.id ?? '',
    contact_id:     contacts.find((c) => c.is_primary)?.id ?? '',
    outcome:        '' as ActivityOutcome | '',
    notes:          '',
    next_step:      '',
    next_step_date: '',
  })
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })) }

  function submit() {
    setError(null)
    const payload: ActivityFormInput = {
      account_id:     accountId,
      opportunity_id: form.opportunity_id || null,
      contact_id:     form.contact_id || null,
      activity_type:  form.activity_type,
      activity_date:  form.activity_date,
      subject:        form.subject.trim(),
      outcome:        form.outcome || null,
      notes:          form.notes.trim() || null,
      next_step:      form.next_step.trim() || null,
      next_step_date: form.next_step_date || null,
    }
    startTransition(async () => {
      const res = await createActivity(payload)
      if (!res.success) { setError(res.error); return }
      onDone?.()
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <Select label="Type" value={form.activity_type} onChange={(e) => set('activity_type', e.target.value as ActivityType)}
          options={Object.entries(ACTIVITY_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
        <Input label="Date" type="date" value={form.activity_date} onChange={(e) => set('activity_date', e.target.value)} />
      </div>
      <Input label="Subject" required value={form.subject} onChange={(e) => set('subject', e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Opportunity" value={form.opportunity_id} onChange={(e) => set('opportunity_id', e.target.value)}>
          <option value="">—</option>
          {opportunities.map((o) => <option key={o.id} value={o.id}>{o.opportunity_name}</option>)}
        </Select>
        <Select label="Contact" value={form.contact_id} onChange={(e) => set('contact_id', e.target.value)}>
          <option value="">—</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </Select>
      </div>
      <Select label="Outcome" value={form.outcome} onChange={(e) => set('outcome', e.target.value as ActivityOutcome)}>
        <option value="">—</option>
        <option value="positive">Positive</option>
        <option value="neutral">Neutral</option>
        <option value="negative">Negative</option>
      </Select>
      <Textarea label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Next step" value={form.next_step} onChange={(e) => set('next_step', e.target.value)} />
        <Input label="Next step date" type="date" value={form.next_step_date} onChange={(e) => set('next_step_date', e.target.value)} />
      </div>
      <Button onClick={submit} loading={pending} disabled={!form.subject.trim()}>Log activity</Button>
    </div>
  )
}
