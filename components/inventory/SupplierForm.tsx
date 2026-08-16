'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createSupplier, updateSupplier } from '@/lib/actions/inventory'
import type { SupplierFormInput } from '@/lib/validators/inventory'
import type { InvSupplier } from '@/lib/supabase/types-inventory'
import { safeCall } from '@/lib/actions/safe-call'

export function SupplierForm({
  supplier, kitchenVendors = [],
}: {
  supplier?: InvSupplier
  /** The six kitchen supplier slots. Empty = kitchen module not migrated. */
  kitchenVendors?: { id: string; display_name: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    name:            supplier?.name ?? '',
    contact_phone:   supplier?.contact_phone ?? '',
    contact_email:   supplier?.contact_email ?? '',
    contact_address: supplier?.contact_address ?? '',
    notes:           supplier?.notes ?? '',
    kitchen_vendor_id: (supplier as { kitchen_vendor_id?: string | null })?.kitchen_vendor_id ?? '',
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
      kitchen_vendor_id: form.kitchen_vendor_id || null,
    }
    startTransition(async () => {
      const res = supplier ? await safeCall(() => updateSupplier(supplier.id, payload)) : await safeCall(() => createSupplier(payload))
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
      {kitchenVendors.length > 0 && (
        <label className="block">
          <span className="field-label">Kitchen vendor</span>
          <select
            value={form.kitchen_vendor_id}
            onChange={(e) => set('kitchen_vendor_id', e.target.value)}
            className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:border-forest-600 focus:outline-none"
          >
            <option value="">— not a kitchen supplier —</option>
            {kitchenVendors.map((v) => <option key={v.id} value={v.id}>{v.display_name}</option>)}
          </select>
          <span className="mt-1 block text-xs text-gray-500">
            Which of the six daily-requisition slots this supplier fills. Leave blank for
            housekeeping or amenities suppliers.
          </span>
        </label>
      )}

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
