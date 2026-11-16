'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { saveSupplier } from '@/lib/actions/landscaping'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import { TAP } from './ui'

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
  const [errors, setErrors] = useState<{ name?: string; opening?: string }>({})

  function save() {
    const e: typeof errors = {}
    if (!name.trim()) e.name = 'Enter the supplier name'
    if (canSetOpening && opening.trim() && !Number.isFinite(Number(opening))) e.opening = 'Enter a number'
    setErrors(e)
    if (Object.keys(e).length) return
    start(async () => {
      const r = await safeCall(() => saveSupplier({ id: supplier?.id, name, phone, address, ...(canSetOpening ? { opening_balance: Number(opening) || 0 } : {}) }))
      if (!r.success) {
        if (/name/i.test(r.error)) setErrors({ name: r.error })
        toast.error(r.error); return
      }
      toast.success('Supplier saved'); setOpen(false); router.refresh()
    })
  }

  return (
    <>
      <Button variant={supplier ? 'outline' : 'primary'} size="md" className={TAP} onClick={() => { setErrors({}); setOpen(true) }}>
        {supplier ? <><Pencil size={14} /> Edit supplier</> : <><Plus size={14} /> Add supplier</>}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={supplier ? 'Edit supplier' : 'New supplier'}
        footer={<>
          <Button variant="outline" size="md" className={TAP} onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" size="md" className={TAP} loading={pending} onClick={save}>Save supplier</Button>
        </>}>
        <div className="space-y-3">
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <Input label="Phone" type="tel" inputMode="tel" placeholder="01XXXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Input label="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
          {canSetOpening && (
            <Input label="Opening dues (Tk)" type="number" step="any" inputMode="decimal" value={opening}
              onChange={(e) => setOpening(e.target.value)} error={errors.opening}
              hint="What we already owed this supplier before using the system. Leave 0 if nothing." />
          )}
        </div>
      </Modal>
    </>
  )
}
