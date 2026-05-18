import { formatBDT } from '@/lib/formatters/currency'

interface Props {
  bookingTotal:  number
  advance:       number
  chargesTotal:  number
  paymentsTotal: number
  /** netDue > 0 → guest owes (Remaining Due), netDue < 0 → resort owes (Refund Due) */
  netDue:        number
  /** Optional discount applied on the checkout */
  discountAmount?: number
}

export function CheckoutSummary({
  bookingTotal, advance, chargesTotal, paymentsTotal, netDue, discountAmount,
}: Props) {
  const isRefund  = netDue < 0
  const isSettled = netDue === 0
  const totalDue  = bookingTotal + chargesTotal - (discountAmount ?? 0)

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-700 mb-2">Bill Summary</h3>

      <Row label="Booking Total"  value={formatBDT(bookingTotal)} />
      {chargesTotal > 0 && (
        <Row label="Extra Charges (during stay)" value={`+ ${formatBDT(chargesTotal)}`} />
      )}
      {(discountAmount ?? 0) > 0 && (
        <Row
          label="Discount"
          value={`− ${formatBDT(discountAmount ?? 0)}`}
          className="text-emerald-700"
        />
      )}
      <div className="my-1 border-t border-violet-200" />
      <Row label="Total Due" value={formatBDT(totalDue)} bold />
      <Row label="Advance Paid" value={`− ${formatBDT(advance)}`} />
      {paymentsTotal > 0 && (
        <Row label="Payments at Checkout" value={`− ${formatBDT(paymentsTotal)}`} />
      )}

      <div className={`mt-2 rounded-lg p-3 ${
        isSettled
          ? 'bg-emerald-100 text-emerald-900'
          : isRefund
            ? 'bg-teal-100 text-teal-900'
            : 'bg-violet-700 text-white'
      }`}>
        <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
          {isSettled ? 'Settled' : isRefund ? 'Refund Due' : 'Remaining Due'}
        </p>
        <p className="font-mono text-2xl font-bold tabular-nums">
          {formatBDT(Math.abs(netDue))}
        </p>
      </div>
    </div>
  )
}

function Row({
  label, value, bold, className,
}: { label: string; value: string; bold?: boolean; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>{label}</span>
      <span className={`font-mono tabular-nums ${bold ? 'font-bold text-gray-900' : 'text-gray-700'} ${className ?? ''}`}>
        {value}
      </span>
    </div>
  )
}
