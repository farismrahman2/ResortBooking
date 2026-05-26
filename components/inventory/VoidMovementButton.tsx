'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { voidMovement } from '@/lib/actions/inventory'

interface Props {
  movementId:  string
  hasExpense:  boolean
}

export function VoidMovementButton({ movementId, hasExpense }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function confirm() {
    if (!reason.trim()) { setError('A reason is required'); return }
    setError(null)
    startTransition(async () => {
      const res = await voidMovement(movementId, reason.trim())
      if (!res.success) { setError(res.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return <Button variant="danger" size="sm" onClick={() => setOpen(true)}>Void</Button>
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
      <p className="font-medium text-red-800">Void this movement?</p>
      <p className="mt-0.5 text-xs text-red-700">
        Its stock impact will be reversed.{hasExpense && ' The linked expense will be deleted.'}
      </p>
      <input
        type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)"
        className="mt-2 w-full rounded-md border border-red-300 px-2.5 py-1.5 text-sm focus:border-red-500 focus:outline-none"
      />
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button variant="danger" size="sm" onClick={confirm} loading={pending}>Confirm void</Button>
        <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  )
}
