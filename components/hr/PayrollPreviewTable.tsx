'use client'

import { formatBDT } from '@/lib/formatters/currency'

interface Line {
  employee_id:       string
  employee_code:     string
  full_name:         string
  gross:             number
  days_in_month:     number
  days_present:      number
  days_unpaid_leave: number
  days_absent:       number
  unpaid_deduction:  number
  bonuses:           number
  eid_bonus:         number
  other_additions:   number
  fines:             number
  advance_deduction: number
  loan_deduction:    number
  other_deductions:  number
  service_charge:    number
  net_pay:           number
}

interface Props {
  lines:       Line[]
  totalGross:  number
  totalNet:    number
}

export function PayrollPreviewTable({ lines, totalGross, totalNet }: Props) {
  if (lines.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">No payable lines for this period.</p>
        <p className="mt-1 text-xs text-gray-500">
          Make sure each active employee has a salary structure set.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[1100px]">
          <thead className="border-b border-gray-200 bg-gray-50 sticky top-0">
            <tr className="text-left uppercase tracking-wide text-gray-500">
              <th className="px-2 py-2 font-medium">Employee</th>
              <th className="px-2 py-2 text-right font-medium">Gross</th>
              <th className="px-2 py-2 text-center font-medium">Days</th>
              <th className="px-2 py-2 text-right font-medium">Unpaid</th>
              <th className="px-2 py-2 text-right font-medium">Bonus</th>
              <th className="px-2 py-2 text-right font-medium">Fines</th>
              <th className="px-2 py-2 text-right font-medium">Advance</th>
              <th className="px-2 py-2 text-right font-medium">Loan</th>
              <th className="px-2 py-2 text-right font-medium">Service</th>
              <th className="px-2 py-2 text-right font-medium bg-sky-50">Net Pay</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lines.map((l) => (
              <tr key={l.employee_id} className="hover:bg-gray-50/60">
                <td className="px-2 py-2 align-top">
                  <p className="font-medium text-gray-900">{l.full_name}</p>
                  <p className="text-[10px] font-mono text-gray-500">{l.employee_code}</p>
                </td>
                <td className="px-2 py-2 align-top text-right font-mono tabular-nums">{formatBDT(l.gross)}</td>
                <td className="px-2 py-2 align-top text-center text-gray-600">
                  {l.days_present}/{l.days_in_month}
                  {(l.days_unpaid_leave + l.days_absent) > 0 && (
                    <p className="text-[10px] text-rose-600">−{l.days_unpaid_leave + l.days_absent} unpaid</p>
                  )}
                </td>
                <td className="px-2 py-2 align-top text-right font-mono tabular-nums text-rose-700">
                  {l.unpaid_deduction > 0 ? `− ${formatBDT(l.unpaid_deduction)}` : '—'}
                </td>
                <td className="px-2 py-2 align-top text-right font-mono tabular-nums text-emerald-700">
                  {(l.bonuses + l.eid_bonus + l.other_additions) > 0
                    ? `+ ${formatBDT(l.bonuses + l.eid_bonus + l.other_additions)}`
                    : '—'}
                </td>
                <td className="px-2 py-2 align-top text-right font-mono tabular-nums text-rose-700">
                  {l.fines > 0 ? `− ${formatBDT(l.fines)}` : '—'}
                </td>
                <td className="px-2 py-2 align-top text-right font-mono tabular-nums text-rose-700">
                  {l.advance_deduction > 0 ? `− ${formatBDT(l.advance_deduction)}` : '—'}
                </td>
                <td className="px-2 py-2 align-top text-right font-mono tabular-nums text-rose-700">
                  {l.loan_deduction > 0 ? `− ${formatBDT(l.loan_deduction)}` : '—'}
                </td>
                <td className="px-2 py-2 align-top text-right font-mono tabular-nums text-emerald-700">
                  {l.service_charge > 0 ? `+ ${formatBDT(l.service_charge)}` : '—'}
                </td>
                <td className="px-2 py-2 align-top text-right font-mono tabular-nums font-bold text-sky-900 bg-sky-50">
                  {formatBDT(l.net_pay)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <td colSpan={1} className="px-2 py-2 text-right text-gray-700">Totals</td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">{formatBDT(totalGross)}</td>
              <td colSpan={7} />
              <td className="px-2 py-2 text-right font-mono tabular-nums text-sky-900 bg-sky-100">{formatBDT(totalNet)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
