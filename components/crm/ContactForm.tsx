'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createContact, updateContact } from '@/lib/actions/crm'
import type { ContactFormInput } from '@/lib/validators/crm'
import type { CrmContact, Department } from '@/lib/supabase/types-crm'
import { DEPARTMENT_LABELS } from './labels'

interface Props {
  accountId: string
  contact?:  CrmContact
}

export function ContactForm({ accountId, contact }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    full_name:       contact?.full_name ?? '',
    designation:     contact?.designation ?? '',
    department:      (contact?.department ?? '') as Department | '',
    email:           contact?.email ?? '',
    phone:           contact?.phone ?? '',
    whatsapp:        contact?.whatsapp ?? '',
    office_location: contact?.office_location ?? '',
    is_primary:      contact?.is_primary ?? false,
    linkedin_url:    contact?.linkedin_url ?? '',
    notes:           contact?.notes ?? '',
  })

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })) }

  function submit() {
    setError(null)
    const payload: ContactFormInput = {
      account_id:      accountId,
      full_name:       form.full_name.trim(),
      designation:     form.designation.trim() || null,
      department:      form.department || null,
      email:           form.email.trim() || null,
      phone:           form.phone.trim() || null,
      whatsapp:        form.whatsapp.trim() || null,
      office_location: form.office_location.trim() || null,
      is_primary:      form.is_primary,
      linkedin_url:    form.linkedin_url.trim() || null,
      notes:           form.notes.trim() || null,
    }
    startTransition(async () => {
      const res = contact ? await updateContact(contact.id, payload) : await createContact(payload)
      if (!res.success) { setError(res.error); return }
      router.push(`/crm/accounts/${accountId}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <Input label="Full name" required value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Designation" value={form.designation} onChange={(e) => set('designation', e.target.value)} hint="e.g. Head of L&D" />
        <Select label="Department" value={form.department} onChange={(e) => set('department', e.target.value as Department)}>
          <option value="">—</option>
          {Object.entries(DEPARTMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} hint="01XXX-XXXXXX" />
        <Input label="WhatsApp" value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} hint="01XXX-XXXXXX" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        <Input label="Office location" value={form.office_location} onChange={(e) => set('office_location', e.target.value)} />
      </div>
      <Input label="LinkedIn URL" value={form.linkedin_url} onChange={(e) => set('linkedin_url', e.target.value)} />
      <Textarea label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.is_primary} onChange={(e) => set('is_primary', e.target.checked)} className="accent-amber-600" />
        Primary contact for this account (only one per account)
      </label>
      <div className="flex gap-2 pt-1">
        <Button onClick={submit} loading={pending} disabled={!form.full_name.trim()}>
          {contact ? 'Save changes' : 'Add contact'}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  )
}
