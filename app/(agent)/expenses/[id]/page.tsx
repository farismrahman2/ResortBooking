import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Pencil } from 'lucide-react'
import { getExpenseById } from '@/lib/queries/expenses'
import { ReceiptThumbnails } from '@/components/expenses/ReceiptThumbnails'
import { ReceiptUploader } from '@/components/expenses/ReceiptUploader'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import {
  PAYMENT_METHOD_LABELS,
  PAYEE_TYPE_LABELS,
  CATEGORY_GROUP_BADGE,
} from '@/components/expenses/labels'
import { DeleteExpenseButton } from './DeleteExpenseButton'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export default async function ExpenseDetailPage({ params }: PageProps) {
  const expense = await getExpenseById(params.id)
  if (!expense) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Expense Detail" subtitle={`Recorded ${formatDate(expense.created_at)}`} />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-5">
          {/* Header card */}
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-rose-700">Amount</p>
                <p className="mt-1 font-mono text-3xl font-bold text-rose-900 tabular-nums">
                  {formatBDT(Number(expense.amount))}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-rose-700">Date</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-800">{formatDate(expense.expense_date)}</p>
              </div>
            </div>
            {expense.is_draft && (
              <div className="mt-3 inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800">
                Draft (auto-generated, not yet confirmed)
              </div>
            )}
          </div>

          {/* Detail card */}
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
              <div>
                <dt className="text-xs font-medium text-gray-500">Category</dt>
                <dd className="mt-0.5">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                      CATEGORY_GROUP_BADGE[expense.category.category_group]
                    }`}
                  >
                    {expense.category.name}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Payee</dt>
                <dd className="mt-0.5 text-gray-800">
                  {expense.payee
                    ? <>{expense.payee.name} <span className="text-xs text-gray-400">({PAYEE_TYPE_LABELS[expense.payee.payee_type]})</span></>
                    : <span className="text-gray-400">—</span>}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Payment Method</dt>
                <dd className="mt-0.5 text-gray-800">{PAYMENT_METHOD_LABELS[expense.payment_method]}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Reference</dt>
                <dd className="mt-0.5 font-mono text-xs text-gray-700">
                  {expense.reference_number ?? <span className="text-gray-400 font-sans">—</span>}
                </dd>
              </div>
              {expense.description && (
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-gray-500">Description</dt>
                  <dd className="mt-0.5 text-gray-800 whitespace-pre-wrap">{expense.description}</dd>
                </div>
              )}
              {expense.notes && (
                <div className="col-span-2">
                  <dt className="text-xs font-medium text-gray-500">Notes</dt>
                  <dd className="mt-0.5 text-gray-700 whitespace-pre-wrap">{expense.notes}</dd>
                </div>
              )}
              {expense.recurring_template_id && (
                <div className="col-span-2 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
                  <p className="text-xs text-indigo-700">
                    Auto-generated from a recurring template.
                  </p>
                </div>
              )}
            </dl>
          </Card>

          {/* Receipts */}
          <Card>
            <CardHeader>
              <CardTitle>Receipts</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <ReceiptThumbnails
                expenseId={expense.id}
                attachments={expense.attachments ?? []}
                editable
              />
              <ReceiptUploader expenseId={expense.id} expenseDate={expense.expense_date} />
            </div>
          </Card>

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <Link href="/expenses">
              <Button variant="outline" size="md">← Back to list</Button>
            </Link>
            <div className="flex items-center gap-2">
              <DeleteExpenseButton id={expense.id} />
              <Link href={`/expenses/${expense.id}/edit`}>
                <Button variant="primary" size="md" className="gap-1.5">
                  <Pencil size={14} />
                  Edit
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
