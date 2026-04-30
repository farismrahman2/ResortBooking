import { formatBDT } from '@/lib/formatters/currency'

interface Props {
  advance:       number
  chargesTotal:  number
  paymentsTotal: number
  /** netDue > 0 → guest owes, netDue < 0 → refund due */
  netDue:        number
}

export function CheckoutSummary({ advance, chargesTotal, paymentsTotal, netDue }: Props) {
  const isRefund = netDue < 0
  const isSettled = netDue === 0

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-violet-700 mb-2">Bill Summary</h3>

      <Row label="Advance Paid (booking)"        value={`− ${formatBDT(advance)}`} />
      <Row label="Total Charges"                 value={formatBDT(chargesTotal)} />
      <div className="my-1 border-t border-violet-200" />
      <Row
        label="Subtotal Due"
        value={formatBDT(chargesTotal - advance)}
        bold
      />
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
          {isSettled ? 'Settled' : isRefund ? 'Refund Due' : 'Balance'}
        </p>
        <p className="font-mono text-2xl font-bold tabular-nums">
          {formatBDT(Math.abs(netDue))}
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className={bold ? 'font-semibold text-gray-900' : 'text-gray-600'}>{label}</span>
      <span className={`font-mono tabular-nums ${bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
        {value}
      </span>
    </div>
  )
}
