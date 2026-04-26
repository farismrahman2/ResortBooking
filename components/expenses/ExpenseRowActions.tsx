'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { deleteExpense } from '@/lib/actions/expenses'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'

interface ExpenseRowActionsProps {
  id:           string
  amount:       number
  expense_date: string
  category:     string
}

/**
 * Inline edit + delete buttons for a row in the ExpenseTable.
 * - Edit: navigates to /expenses/[id]/edit (uses the same form as direct-edit)
 * - Delete: opens a confirm modal, calls deleteExpense action, refreshes the table
 */
export function ExpenseRowActions({ id, amount, expense_date, category }: ExpenseRowActionsProps) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [pending, startTransition]    = useTransition()

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteExpense(id)
      if (!result.success) { setError(result.error); return }
      setConfirmOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="inline-flex items-center gap-0.5">
      <Link
        href={`/expenses/${id}/edit`}
        className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-forest-700 transition-colors"
        title="Edit expense"
      >
        <Pencil size={13} />
      </Link>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setConfirmOpen(true) }}
        className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        title="Delete expense"
      >
        <Trash2 size={13} />
      </button>

      <Modal open={confirmOpen} onClose={() => !pending && setConfirmOpen(false)} title="Delete Expense" size="sm">
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
            <p className="font-semibold text-red-900">This action cannot be undone.</p>
            <p className="mt-1 text-xs text-red-800">
              Deleting <span className="font-mono font-semibold">{formatBDT(amount)}</span> · {category} · {formatDate(expense_date)}
            </p>
          </div>

          {error && <p className="text-xs text-red-600 whitespace-pre-wrap">{error}</p>}

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={pending} onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" loading={pending} onClick={handleDelete} className="gap-1.5">
              {pending && <Loader2 size={12} className="animate-spin" />}
              Yes, Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
