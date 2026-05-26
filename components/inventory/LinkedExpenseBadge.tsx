import { Package } from 'lucide-react'
import { formatBDT } from '@/lib/formatters/currency'

export function LinkedExpenseBadge({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700">
      <Package size={12} /> Expense {formatBDT(amount)} created
    </span>
  )
}
