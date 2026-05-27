'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createSupplier, updateSupplier } from '@/lib/actions/inventory'
import type { SupplierFormInput } from '@/lib/validators/inventory'
import type { InvSupplier } from '@/lib/supabase/types-inventory'

export function SupplierForm({ supplier }: { supplier?: InvSupplier }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name:            supplier?.name ?? '',
    contact_phone:   supplier?.contact_phone ?? '',
    contact_email:   supplier?.contact_email ?? '',
    contact_address: supplier?.contact_address ?? '',
    notes:           supplier?.notes ?? '',
  })

  function set<K extends keyof typeof form>(k: K, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  function submit() {
    setError(null)
    const payload: SupplierFormInput = {
      name:            form.name.trim(),
      contact_phone:   form.contact_phone.trim() || null,
      contact_email:   form.contact_email.trim() || null,
      contact_address: form.contact_address.trim() || null,
      notes:           form.notes.trim() || null,
      expense_payee_id: supplier?.expense_payee_id ?? null,
    }
    startTransition(async () => {
      const res = supplier ? await updateSupplier(supplier.id, payload) : await createSupplier(payload)
      if (!res.success) { setError(res.error); return }
      router.push('/inventory/suppliers')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      <Input label="Name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Phone" value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
        <Input label="Email" type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
      </div>
      <Input label="Address" value={form.contact_address} onChange={(e) => set('contact_address', e.target.value)} />
      <Textarea label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      {!supplier && (
        <p className="text-xs text-gray-500">
          A matching expense payee is created automatically so inventory receipts can be charged to it.
        </p>
      )}
      <div className="flex gap-2 pt-2">
        <Button onClick={submit} loading={pending} disabled={!form.name.trim()}>
          {supplier ? 'Save changes' : 'Create supplier'}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  )
}
