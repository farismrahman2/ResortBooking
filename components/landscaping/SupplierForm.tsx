'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { saveSupplier } from '@/lib/actions/landscaping'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'

/** Add or edit a supplier; opening dues ("সাবেক") only for the admin or a payer. */
export function SupplierForm({ supplier, canSetOpening }: {
  supplier?: { id: string; name: string; phone: string | null; address: string | null; opening_balance: number | string; notes: string | null }
  canSetOpening: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const [name, setName] = useState(supplier?.name ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [address, setAddress] = useState(supplier?.address ?? '')
  const [opening, setOpening] = useState(String(supplier?.opening_balance ?? 0))
  function save() {
    start(async () => {
      const r = await safeCall(() => saveSupplier({ id: supplier?.id, name, phone, address, ...(canSetOpening ? { opening_balance: Number(opening) || 0 } : {}) }))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Supplier saved'); setOpen(false); router.refresh()
    })
  }
  return (
    <>
      <Button variant={supplier ? 'outline' : 'primary'} size="sm" onClick={() => setOpen(true)}>{supplier ? 'Edit supplier' : 'Add supplier'}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={supplier ? 'Edit supplier' : 'New supplier'}>
        <div className="space-y-3">
          <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          {canSetOpening && <Input label="Opening dues (Tk) — owed before using the system" type="number" step="any" value={opening} onChange={(e) => setOpening(e.target.value)} />}
          <div className="flex justify-end gap-2"><Button variant="outline" size="md" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" size="md" loading={pending} onClick={save}>Save</Button></div>
        </div>
      </Modal>
    </>
  )
}
