'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { deleteExpense } from '@/lib/actions/expenses'

export function DeleteExpenseButton({ id }: { id: string }) {
  const router = useRouter()
  const [open,    setOpen]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteExpense(id)
      if (!result.success) { setError(result.error); return }
      router.push('/expenses')
    })
  }

  return (
    <>
      <Button variant="danger" size="md" onClick={() => setOpen(true)} className="gap-1.5">
        <Trash2 size={14} />
        Delete
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Delete Expense" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Are you sure you want to delete this expense? This action cannot be undone.
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button variant="danger" loading={pending} onClick={handleDelete}>Yes, Delete</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
