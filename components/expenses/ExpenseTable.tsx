import Link from 'next/link'
import { Paperclip } from 'lucide-react'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import { CATEGORY_GROUP_BADGE, PAYMENT_METHOD_LABELS } from '@/components/expenses/labels'
import { ExpenseRowActions } from '@/components/expenses/ExpenseRowActions'
import type { ExpenseRowWithRefs } from '@/lib/supabase/types'

interface ExpenseTableProps {
  rows:  ExpenseRowWithRefs[]
  total: number
}

export function ExpenseTable({ rows, total }: ExpenseTableProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">No expenses match these filters.</p>
        <p className="mt-1 text-xs text-gray-500">Adjust the date range or clear filters to see entries.</p>
      </div>
    )
  }

  // Sum of currently shown rows (not the full DB total — that's `total` for the count)
  const sumShown = rows.reduce((s, r) => s + Number(r.amount ?? 0), 0)

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Category</th>
              <th className="px-4 py-2.5 font-medium">Payee</th>
              <th className="px-4 py-2.5 font-medium">Description</th>
              <th className="px-4 py-2.5 font-medium">Method</th>
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
              <th className="px-2 py-2.5 font-medium" />
              <th className="px-3 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-2.5 align-top whitespace-nowrap">
                  <Link href={`/expenses/${r.id}`} className="font-medium text-gray-800 hover:text-forest-700">
                    {formatDate(r.expense_date)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 align-top">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      CATEGORY_GROUP_BADGE[r.category.category_group] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                    }`}
                  >
                    {r.category.name}
                  </span>
                </td>
                <td className="px-4 py-2.5 align-top text-gray-700">
                  {r.payee?.name ?? <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-2.5 align-top text-gray-600 max-w-[280px] truncate">
                  {r.description ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 align-top text-xs text-gray-500">
                  {PAYMENT_METHOD_LABELS[r.payment_method]}
                </td>
                <td className="px-4 py-2.5 align-top text-right font-mono font-semibold text-gray-900 tabular-nums">
                  {formatBDT(Number(r.amount))}
                </td>
                <td className="px-2 py-2.5 align-top text-right">
                  {r.attachments && r.attachments.length > 0 && (
                    <span title={`${r.attachments.length} receipt${r.attachments.length !== 1 ? 's' : ''}`}>
                      <Paperclip size={13} className="inline text-gray-400" />
                      <span className="ml-0.5 text-[10px] font-mono text-gray-400">{r.attachments.length}</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 align-top text-right">
                  <ExpenseRowActions
                    id={r.id}
                    amount={Number(r.amount)}
                    expense_date={r.expense_date}
                    category={r.category.name}
                  />
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 bg-gray-50 text-sm font-semibold">
              <td colSpan={5} className="px-4 py-2.5 text-right text-gray-600">
                Subtotal ({rows.length} of {total} entries)
              </td>
              <td className="px-4 py-2.5 text-right font-mono tabular-nums text-gray-900">
                {formatBDT(sumShown)}
              </td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
