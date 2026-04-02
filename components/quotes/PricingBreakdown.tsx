import { cn } from '@/lib/utils'
import { formatBDT } from '@/lib/formatters/currency'
import type { CalculationResult } from '@/lib/engine/calculator'

interface PricingBreakdownProps {
  result: CalculationResult | null
  loading?: boolean
}

function SkeletonRow() {
  return (
    <tr>
      <td className="py-1.5 pr-3">
        <div className="h-3.5 w-32 rounded bg-gray-200 animate-pulse" />
      </td>
      <td className="py-1.5 text-right">
        <div className="ml-auto h-3.5 w-8 rounded bg-gray-200 animate-pulse" />
      </td>
      <td className="py-1.5 text-right">
        <div className="ml-auto h-3.5 w-12 rounded bg-gray-200 animate-pulse" />
      </td>
      <td className="py-1.5 text-right">
        <div className="ml-auto h-3.5 w-4 rounded bg-gray-200 animate-pulse" />
      </td>
      <td className="py-1.5 text-right">
        <div className="ml-auto h-3.5 w-16 rounded bg-gray-200 animate-pulse" />
      </td>
    </tr>
  )
}

export function PricingBreakdown({ result, loading }: PricingBreakdownProps) {
  if (!result && !loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 py-10">
        <p className="text-sm text-gray-400">Fill form to see pricing</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="py-2 pl-4 pr-3 text-left font-medium">Item</th>
              <th className="py-2 px-2 text-right font-medium">Qty</th>
              <th className="py-2 px-2 text-right font-medium">Unit</th>
              <th className="py-2 px-2 text-right font-medium">Nights</th>
              <th className="py-2 pl-2 pr-4 text-right font-medium">Subtotal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : (
              result!.line_items.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50/50">
                  <td className="py-2 pl-4 pr-3 text-gray-800">{item.label}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-600">
                    {item.qty}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-600 text-xs">
                    {formatBDT(item.unit_price)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums text-gray-500 text-xs">
                    {item.nights ?? '—'}
                  </td>
                  <td className="py-2 pl-2 pr-4 text-right tabular-nums font-medium text-gray-800">
                    {formatBDT(item.subtotal)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Totals section */}
      <div className="border-t border-gray-200 bg-gray-50/50 px-4 py-3 space-y-1.5">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex justify-between">
                <div className="h-3.5 w-24 rounded bg-gray-200 animate-pulse" />
                <div className="h-3.5 w-20 rounded bg-gray-200 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <TotalRow label="Subtotal" value={result!.subtotal} />
            {result!.discount > 0 && (
              <TotalRow label="Discount" value={-result!.discount} isNegative />
            )}
            <TotalRow
              label="Total"
              value={result!.total}
              highlight
              bold
            />
            <div className="my-1 border-t border-gray-200" />
            <TotalRow label="Advance Required" value={result!.advance_required} />
            <TotalRow label="Advance Paid" value={result!.advance_paid} />
            <TotalRow label="Due Advance" value={result!.due_advance} />
            <div className="my-1 border-t border-gray-200" />
            <TotalRow
              label="Remaining"
              value={result!.remaining}
              highlight
              bold
            />
          </>
        )}
      </div>
    </div>
  )
}

function TotalRow({
  label,
  value,
  highlight,
  bold,
  isNegative,
}: {
  label: string
  value: number
  highlight?: boolean
  bold?: boolean
  isNegative?: boolean
}) {
  const displayValue = isNegative ? `-${formatBDT(Math.abs(value))}` : formatBDT(value)

  return (
    <div
      className={cn(
        'flex items-center justify-between px-1 py-0.5 rounded',
        highlight && 'bg-forest-50 border border-forest-100',
      )}
    >
      <span
        className={cn(
          'text-sm',
          bold ? 'font-semibold text-gray-900' : 'text-gray-600',
          highlight && 'text-forest-800',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'tabular-nums text-sm',
          bold ? 'font-bold' : 'font-medium',
          isNegative ? 'text-red-600' : highlight ? 'text-forest-700' : 'text-gray-800',
        )}
      >
        {displayValue}
      </span>
    </div>
  )
}
