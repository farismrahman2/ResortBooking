import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { getDailyIncomeByMethod, METHOD_LABEL, type PaymentMethod } from '@/lib/queries/reports/income-by-method'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

function todayDhaka(): string {
  const now = new Date()
  // shift to Dhaka local (UTC+6) and extract YYYY-MM-DD
  const dhaka = new Date(now.getTime() + (6 * 60 - now.getTimezoneOffset()) * 60 * 1000)
  return dhaka.toISOString().slice(0, 10)
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function IncomeByPaymentMethodReport({ searchParams }: { searchParams: { date?: string } }) {
  // Permission gate: anyone with reports:read, plus front_desk (so they can
  // reconcile shift takings). Mirrors the ROLE_ALLOW carve-out in middleware.
  const ctx = await getCurrentUserContext()
  if (!ctx) redirect('/login')
  const hasReports = ctx.permissions.reports === 'read' || ctx.permissions.reports === 'write'
  const isFrontDesk = ctx.profile.role.slug === 'front_desk'
  if (!hasReports && !isFrontDesk) redirect('/403?from=reports')
  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : todayDhaka()
  const data = await getDailyIncomeByMethod(date)
  const today = todayDhaka()
  const yesterday = shiftDate(today, -1)

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Daily income — by payment method" subtitle={formatDate(date)} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <DateLink label="Today" date={today} active={date === today} />
          <DateLink label="Yesterday" date={yesterday} active={date === yesterday} />
          <form action="/reports/income/by-payment-method" method="get" className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Pick a date:</label>
            <input type="date" name="date" defaultValue={date}
              className="rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-forest-600 focus:outline-none" />
            <button className="rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-700">Go</button>
          </form>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi label="Checkout receipts" value={formatBDT(data.checkout)} />
          <Kpi label="Coffee shop sales" value={formatBDT(data.coffee_shop)} />
          <Kpi label="Total income" value={formatBDT(data.total)} emphasis />
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Method</th>
                <th className="px-4 py-2.5 font-medium text-right">Checkout</th>
                <th className="px-4 py-2.5 font-medium text-right">Coffee shop</th>
                <th className="px-4 py-2.5 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.rows.map((r) => (
                <tr key={r.method} className={r.total > 0 ? '' : 'text-gray-400'}>
                  <td className="px-4 py-2 font-medium">{METHOD_LABEL[r.method as PaymentMethod]}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatBDT(r.checkout)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatBDT(r.coffee_shop)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{formatBDT(r.total)}</td>
                </tr>
              ))}
              <tr className="border-t border-gray-300 bg-gray-50 font-semibold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatBDT(data.checkout)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatBDT(data.coffee_shop)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatBDT(data.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Settlements detail — every individual payment that rolled into the
            method totals above. Grouped by method, with a subtotal that should
            exactly match the corresponding row in the totals table. */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">Settlements detail</h3>
          {data.settlements.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">No settlements on this day.</div>
          ) : (
            <div className="space-y-4">
              {data.rows.filter((r) => r.total > 0).map((row) => {
                const items = data.settlements.filter((s) => s.method === row.method)
                if (items.length === 0) return null
                return (
                  <div key={row.method} className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2">
                      <h4 className="text-sm font-semibold text-gray-800">{METHOD_LABEL[row.method as PaymentMethod]}</h4>
                      <span className="text-sm font-bold tabular-nums text-gray-900">{formatBDT(row.total)}</span>
                    </div>
                    <table className="min-w-full text-sm">
                      <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-4 py-1.5 font-medium">Time</th>
                          <th className="px-4 py-1.5 font-medium">Source</th>
                          <th className="px-4 py-1.5 font-medium">Reference / guest</th>
                          <th className="px-4 py-1.5 font-medium">Notes</th>
                          <th className="px-4 py-1.5 font-medium text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {items.map((s, i) => (
                          <tr key={i}>
                            <td className="px-4 py-1.5 text-xs tabular-nums text-gray-500">{s.time || '—'}</td>
                            <td className="px-4 py-1.5 text-xs text-gray-600">{s.source === 'checkout' ? 'Checkout' : 'Coffee shop'}</td>
                            <td className="px-4 py-1.5 text-gray-800">{s.description}</td>
                            <td className="px-4 py-1.5 text-xs text-gray-500">{s.reference ?? '—'}</td>
                            <td className="px-4 py-1.5 text-right tabular-nums">{formatBDT(s.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50">
                          <td colSpan={4} className="px-4 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Subtotal</td>
                          <td className="px-4 py-1.5 text-right tabular-nums font-semibold">{formatBDT(items.reduce((sum, x) => sum + x.amount, 0))}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400">
          Method-tagged income only — i.e. checkout receipts (per-payment method) and coffee-shop sales (split tender).
          Booking advances have no method recorded in this system and are excluded; most settle later via checkout, which is captured here.
        </p>
        <Link href="/reports" className="inline-block text-sm text-forest-700 hover:underline">← Back to Reports</Link>
      </div>
    </div>
  )
}

function DateLink({ label, date, active }: { label: string; date: string; active: boolean }) {
  return (
    <Link href={`/reports/income/by-payment-method?date=${date}`}
      className={`rounded-full px-3 py-1 text-sm ${active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
      {label}
    </Link>
  )
}

function Kpi({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${emphasis ? 'text-forest-800' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
