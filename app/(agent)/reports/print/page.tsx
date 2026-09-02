import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { toIsoDate } from '@/lib/reports/periods'
import { getHubTotals } from '@/lib/queries/reports/hub'
import { getPackageRevenue, getDailyIncome, getIndustryKpis } from '@/lib/queries/reports/income'
import { getIncomeByMethodRange, METHOD_LABEL, PAYMENT_METHODS } from '@/lib/queries/reports/income-by-method'
import { getPaymentTransactions, SOURCE_LABEL } from '@/lib/queries/reports/payment-transactions'
import { getOutstandingDues } from '@/lib/queries/reports/dues'
import { getCashCheckoutReport } from '@/lib/queries/reports/cash-checkout'
import { getGuestReport } from '@/lib/queries/reports/guests'
import { getOccupancyByDay } from '@/lib/queries/reports/operations'
import { getCategoryBreakdownReports, getTopVendors } from '@/lib/queries/reports/expenses'
import { getMonthlyPnL } from '@/lib/queries/reports/profitability'
import { getSalaryVsRevenue, getAttendanceReport } from '@/lib/queries/reports/hr'
import { getExtrasOverview, getTopChargeItems } from '@/lib/queries/reports/checkout'
import { getCoffeeShopOverview } from '@/lib/queries/reports/coffee-shop'
import { PrintReportToolbar, type PrintSectionOption } from '@/components/reports/PrintReportToolbar'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate, formatDateShort } from '@/lib/formatters/dates'
import { todayDhaka } from '@/lib/dates'

export const dynamic = 'force-dynamic'

const nf = (n: number) => n.toLocaleString('en-IN')
const monthLabel = (iso: string) =>
  new Date(iso + (iso.length === 7 ? '-01' : '') + 'T12:00:00Z')
    .toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })

const ALL_SECTIONS = [
  { id: 'summary',       label: 'Summary' },
  { id: 'income',        label: 'Income' },
  { id: 'money',         label: 'Money received' },
  { id: 'transactions',  label: 'Transaction detail' },
  { id: 'dues',          label: 'Outstanding dues' },
  { id: 'cash',          label: 'Cash checkout' },
  { id: 'guests',        label: 'Guests' },
  { id: 'operations',    label: 'Occupancy' },
  { id: 'expenses',      label: 'Expenses' },
  { id: 'profitability', label: 'Profit & loss' },
  { id: 'hr',            label: 'HR & payroll' },
  { id: 'extras',        label: 'Guest extras' },
  { id: 'coffee',        label: 'Coffee shop' },
] as const
type SectionId = typeof ALL_SECTIONS[number]['id']

interface PageProps {
  searchParams: {
    from?: string; to?: string; period?: string; sections?: string
    account?: string; minDays?: string
  }
}

/**
 * The master report: every section of Reports assembled into one designed A4
 * document for any date range. Chrome's print dialog → "Save as PDF" is the
 * download (same approach as the requisition sheet — no PDF library renders
 * these tables better than print CSS does).
 *
 * Sections a module permission doesn't allow are silently dropped; a section
 * whose query fails renders a small note instead of sinking the whole report.
 */
export default async function PrintableReportPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const { period } = resolvePeriod(searchParams)
  const fromIso = toIsoDate(period.from)
  const toIso   = toIsoDate(period.to)

  const [hrOk, checkoutOk, expensesOk, coffeeOk] = await Promise.all([
    hasPermission('hr', 'read'),
    hasPermission('checkout', 'read'),
    hasPermission('expenses', 'read'),
    hasPermission('coffee_shop', 'read'),
  ])
  const permitted = new Set<SectionId>(ALL_SECTIONS.map((s) => s.id))
  if (!hrOk)       permitted.delete('hr')
  if (!checkoutOk) permitted.delete('extras')
  if (!expensesOk) { permitted.delete('expenses'); permitted.delete('profitability') }
  if (!coffeeOk)   permitted.delete('coffee')

  const requested = (searchParams.sections?.split(',').filter(Boolean) ?? ALL_SECTIONS.map((s) => s.id)) as SectionId[]
  const wanted = new Set(requested.filter((s) => permitted.has(s)))
  const has = (s: SectionId) => wanted.has(s)

  const parsedMinDays = Number(searchParams.minDays)
  const duesMinDays = Number.isFinite(parsedMinDays) && parsedMinDays >= 1 && parsedMinDays <= 3650
    ? Math.floor(parsedMinDays)
    : 6

  // Fetch everything the chosen sections need, in one parallel round. A failed
  // fetch nulls its section rather than erroring the whole document.
  const soft = <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null)
  const [
    hub, packages, dailyIncome, industry, guests, occupancy,
    catBreakdown, vendors, pnl, salary, attendance, extras, topCharges, coffee, money, txns, dues,
    cash,
  ] = await Promise.all([
    has('summary')                          ? soft(getHubTotals(period))                : null,
    has('income')                           ? soft(getPackageRevenue(period))           : null,
    has('income')                           ? soft(getDailyIncome(period))              : null,
    has('operations')                       ? soft(getIndustryKpis(period))             : null,
    has('guests')                           ? soft(getGuestReport(period))              : null,
    has('operations')                       ? soft(getOccupancyByDay(period))           : null,
    has('expenses')                         ? soft(getCategoryBreakdownReports(period)) : null,
    has('expenses')                         ? soft(getTopVendors(period))               : null,
    has('profitability')                    ? soft(getMonthlyPnL(period))               : null,
    has('hr')                               ? soft(getSalaryVsRevenue(period))          : null,
    has('hr')                               ? soft(getAttendanceReport(period))         : null,
    has('extras')                           ? soft(getExtrasOverview(period))           : null,
    has('extras')                           ? soft(getTopChargeItems(period, 10))       : null,
    has('coffee')                           ? soft(getCoffeeShopOverview(period))       : null,
    has('money')                            ? soft(getIncomeByMethodRange(fromIso, toIso)) : null,
    has('transactions')                     ? soft(getPaymentTransactions(fromIso, toIso))  : null,
    // Dues are a snapshot as of today — a debt is late relative to now, not to
    // the report's range — so this one section ignores from/to by design.
    has('dues')                             ? soft(getOutstandingDues(duesMinDays))      : null,
    has('cash')                             ? soft(getCashCheckoutReport(fromIso, toIso)) : null,
  ])

  const days = Math.max(1, Math.round((period.to.getTime() - period.from.getTime()) / 86400_000) + 1)
  const occPcts = (occupancy ?? []).map((d) => d.occupancy_pct ?? 0)
  const busiest = guests?.daily.reduce<typeof guests.daily[number] | null>(
    (best, d) => (d.guests > (best?.guests ?? 0) ? d : best), null) ?? null

  const sectionOptions: PrintSectionOption[] = ALL_SECTIONS
    .filter((s) => permitted.has(s.id))
    .map((s) => ({ id: s.id, label: s.label, enabled: wanted.has(s.id) }))

  const Failed = ({ what }: { what: string }) => (
    <p className="rpt-note">The {what} data could not be loaded for this period.</p>
  )

  return (
    <>
      <style>{`
        /* No fixed @page size: the phone's print dialog picks Letter, and
           forcing A4 against it produced blank pages and clipped tables. */
        @page { margin: 12mm; }
        .rpt {
          max-width: 186mm; margin: 0 auto; color: #111827; background: white;
          font-size: 9.5pt; line-height: 1.45;
        }
        .rpt h2 {
          margin: 0; padding-left: 8px; border-left: 4px solid #166534;
          font-size: 12pt; font-weight: 700; letter-spacing: 0.01em;
          break-after: avoid;   /* never a heading orphaned at a page bottom */
        }
        /* Sections FLOW across pages. break-inside: avoid-page here forced any
           section taller than one page onto a fresh page and then clipped it —
           a 26-day daily table lost every row after the first. Long tables now
           split naturally, repeating their header row on each page. */
        .rpt-section { margin-top: 9mm; }
        .rpt thead { display: table-header-group; }
        /* Eight columns of transaction detail need to breathe on A4 — a size
           down, tighter padding, and long references allowed to wrap rather
           than force the table wider than the page. */
        .rpt table.dense { font-size: 7.5pt; }
        .rpt table.dense th,
        .rpt table.dense td { padding: 0.9mm 1.2mm; }
        .rpt table.dense td { overflow-wrap: anywhere; }
        .rpt table.dense .nowrap { white-space: nowrap; }
        .rpt-kpis {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin-top: 3mm;
        }
        .rpt-kpi {
          border: 0.5pt solid #d1d5db; border-radius: 6px; padding: 2.5mm 3mm;
          break-inside: avoid;
        }
        .rpt-kpi b { display: block; font-size: 12.5pt; line-height: 1.2; font-variant-numeric: tabular-nums; }
        .rpt-kpi span { display: block; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; }
        .rpt-kpi small { display: block; font-size: 7.5pt; color: #6b7280; }
        .rpt table {
          width: 100%; border-collapse: collapse; margin-top: 3mm; font-size: 8.5pt;
        }
        .rpt th {
          text-align: left; font-size: 7pt; text-transform: uppercase; letter-spacing: 0.05em;
          color: #6b7280; border-bottom: 1pt solid #111827; padding: 1.2mm 2mm;
        }
        .rpt td { border-bottom: 0.4pt solid #e5e7eb; padding: 1.2mm 2mm; }
        .rpt th.num, .rpt td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .rpt tr.total td { border-top: 1pt solid #111827; border-bottom: none; font-weight: 700; }
        .rpt tbody tr { break-inside: avoid; }
        .rpt-note {
          margin-top: 3mm; border: 0.5pt dashed #d1d5db; border-radius: 6px;
          padding: 2.5mm 3mm; font-size: 8.5pt; color: #6b7280;
        }
        .rpt-cover { border-bottom: 2pt solid #166534; padding-bottom: 4mm; }
        .rpt-cover h1 { margin: 0; font-size: 19pt; font-weight: 800; letter-spacing: 0.01em; }
        .rpt-cover .sub { color: #374151; font-size: 10pt; }
        .rpt-cover .meta { margin-top: 1mm; font-size: 8pt; color: #6b7280; }
        .rpt-foot { margin-top: 10mm; border-top: 0.5pt solid #d1d5db; padding-top: 2mm; font-size: 7.5pt; color: #9ca3af; }
        @media print {
          nav, aside, header, .sidebar, [data-sidebar], [data-topbar], .no-print { display: none !important; }
          body { background: white !important; }
        }
        @media screen {
          .rpt { padding: 10mm 6mm 16mm; }
        }
      `}</style>

      <PrintReportToolbar from={fromIso} to={toIso} sections={sectionOptions}
        extraParams={{
          account: searchParams.account,
          minDays: duesMinDays === 6 ? undefined : String(duesMinDays),
        }} />

      <div className="rpt">
        {/* ── Cover ─────────────────────────────────────────────────── */}
        <div className="rpt-cover">
          <h1>Garden Centre Resort</h1>
          <p className="sub">Management Report — {formatDate(fromIso)} to {formatDate(toIso)}</p>
          <p className="meta">
            {days} day{days === 1 ? '' : 's'} · generated {formatDate(todayDhaka())} ·{' '}
            {[...wanted].length} section{wanted.size === 1 ? '' : 's'}
          </p>
        </div>

        {/* ── Summary ───────────────────────────────────────────────── */}
        {has('summary') && (
          <section className="rpt-section">
            <h2>Summary</h2>
            {!hub ? <Failed what="summary" /> : (
              <div className="rpt-kpis">
                <div className="rpt-kpi"><span>Total revenue</span><b>{formatBDT(hub.total_revenue)}</b>
                  <small>rooms {formatBDT(hub.room_revenue)} · extras {formatBDT(hub.extras_revenue)} · café {formatBDT(hub.coffee_shop_revenue)}</small></div>
                <div className="rpt-kpi"><span>Total expenses</span><b>{formatBDT(hub.total_expenses)}</b></div>
                <div className="rpt-kpi"><span>Net</span><b style={{ color: hub.net >= 0 ? '#166534' : '#b91c1c' }}>{formatBDT(hub.net)}</b></div>
                <div className="rpt-kpi"><span>Bookings · occupancy</span><b>{nf(hub.booking_count)}</b>
                  <small>{hub.avg_occupancy_pct == null ? 'occupancy n/a' : `avg occupancy ${hub.avg_occupancy_pct.toFixed(1)}%`}</small></div>
              </div>
            )}
          </section>
        )}

        {/* ── Income ────────────────────────────────────────────────── */}
        {has('income') && (
          <section className="rpt-section">
            <h2>Income</h2>
            {!packages ? <Failed what="income" /> : (
              <table>
                <thead><tr>
                  <th>Package</th><th className="num">Bookings</th><th className="num">Revenue</th>
                  <th className="num">Avg / booking</th><th className="num">% of total</th>
                </tr></thead>
                <tbody>
                  {packages.map((p) => (
                    <tr key={p.package_name}>
                      <td>{p.package_name}</td>
                      <td className="num">{nf(p.bookings)}</td>
                      <td className="num">{formatBDT(p.total_revenue)}</td>
                      <td className="num">{formatBDT(p.avg_per_booking)}</td>
                      <td className="num">{p.pct_of_total.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {dailyIncome && days <= 35 && (
              <table>
                <thead><tr>
                  <th>Date</th><th className="num">Bookings</th><th className="num">Rooms</th>
                  <th className="num">Extras</th><th className="num">Café</th><th className="num">Total</th>
                </tr></thead>
                <tbody>
                  {dailyIncome.map((d) => (
                    <tr key={d.date}>
                      <td>{formatDate(d.date)}</td>
                      <td className="num">{nf(d.bookings)}</td>
                      <td className="num">{formatBDT(d.room_revenue)}</td>
                      <td className="num">{formatBDT(d.extras_revenue)}</td>
                      <td className="num">{formatBDT(d.coffee_shop_revenue)}</td>
                      <td className="num"><strong>{formatBDT(d.total_revenue)}</strong></td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total</td>
                    <td className="num">{nf(dailyIncome.reduce((s, d) => s + d.bookings, 0))}</td>
                    <td className="num">{formatBDT(dailyIncome.reduce((s, d) => s + d.room_revenue, 0))}</td>
                    <td className="num">{formatBDT(dailyIncome.reduce((s, d) => s + d.extras_revenue, 0))}</td>
                    <td className="num">{formatBDT(dailyIncome.reduce((s, d) => s + d.coffee_shop_revenue, 0))}</td>
                    <td className="num">{formatBDT(dailyIncome.reduce((s, d) => s + d.total_revenue, 0))}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {dailyIncome && days > 35 && (
              <p className="rpt-note">Daily breakdown omitted for ranges over 35 days — narrow the range to include it.</p>
            )}
          </section>
        )}

        {/* ── Money received by method ──────────────────────────────── */}
        {has('money') && (
          <section className="rpt-section">
            <h2>Money received by method</h2>
            {!money ? <Failed what="money received" /> : (
              <>
                <table>
                  <thead><tr>
                    <th>Method</th><th className="num">Advances</th><th className="num">Checkout</th>
                    <th className="num">Coffee shop</th><th className="num">Total</th>
                  </tr></thead>
                  <tbody>
                    {money.rows.filter((r) => r.total > 0).map((r) => (
                      <tr key={r.method}>
                        <td>{METHOD_LABEL[r.method]}</td>
                        <td className="num">{r.advances ? formatBDT(r.advances) : '—'}</td>
                        <td className="num">{r.checkout ? formatBDT(r.checkout) : '—'}</td>
                        <td className="num">{r.coffee_shop ? formatBDT(r.coffee_shop) : '—'}</td>
                        <td className="num"><strong>{formatBDT(r.total)}</strong></td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td>Total received</td>
                      <td className="num">{formatBDT(money.totals.advances)}</td>
                      <td className="num">{formatBDT(money.totals.checkout)}</td>
                      <td className="num">{formatBDT(money.totals.coffee_shop)}</td>
                      <td className="num">{formatBDT(money.totals.total)}</td>
                    </tr>
                  </tbody>
                </table>
                {money.daily.length > 0 && days <= 35 && (
                  <table>
                    <thead><tr>
                      <th>Date</th>
                      {PAYMENT_METHODS.filter((m) => money.rows.find((r) => r.method === m && r.total > 0)).map((m) => (
                        <th key={m} className="num">{METHOD_LABEL[m]}</th>
                      ))}
                      <th className="num">Total</th>
                    </tr></thead>
                    <tbody>
                      {money.daily.map((d) => (
                        <tr key={d.date}>
                          <td>{formatDate(d.date)}</td>
                          {PAYMENT_METHODS.filter((m) => money.rows.find((r) => r.method === m && r.total > 0)).map((m) => (
                            <td key={m} className="num">{d.byMethod[m] ? formatBDT(d.byMethod[m]) : '—'}</td>
                          ))}
                          <td className="num"><strong>{formatBDT(d.total)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className="rpt-note">
                  Each advance instalment counts on the day it arrived, in the method it arrived
                  by — a bKash part-payment and a later bank transfer sit in different columns.
                  Cancellations stay included: the advance is non-refundable. Checkout and
                  coffee-shop takings carry their own methods.
                </p>
              </>
            )}
          </section>
        )}

        {/* ── Transaction detail ────────────────────────────────────── */}
        {has('transactions') && (
          <section className="rpt-section">
            <h2>Transaction detail</h2>
            {!txns ? <Failed what="transaction" /> : (() => {
              const rows = searchParams.account
                ? txns.rows.filter((r) => (r.account ?? '') === searchParams.account)
                : txns.rows
              const shown = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100
              return (
                <>
                  {searchParams.account && (
                    <p className="rpt-note">Filtered to <strong>{searchParams.account}</strong> — this total
                    should equal that account&apos;s statement credits for the period.</p>
                  )}
                  <table>
                    <thead><tr>
                      <th>Account / wallet / terminal</th><th className="num">Payments</th><th className="num">Total</th>
                    </tr></thead>
                    <tbody>
                      {txns.byAccount.map((a) => (
                        <tr key={a.account}>
                          <td>{a.account}{a.account_ref ? ` · ${a.account_ref}` : ''}</td>
                          <td className="num">{nf(a.count)}</td>
                          <td className="num"><strong>{formatBDT(a.total)}</strong></td>
                        </tr>
                      ))}
                      <tr className="total">
                        <td>All accounts</td>
                        <td className="num">{nf(txns.rows.length)}</td>
                        <td className="num">{formatBDT(txns.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <table className="dense">
                    <thead><tr>
                      <th>When</th><th>Guest / customer</th><th>Doc</th><th>Type</th>
                      <th>Method</th><th>Landed in</th><th>Reference</th><th className="num">Amount</th>
                    </tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={`${r.source}-${r.id}`}>
                          <td className="nowrap">{formatDateShort(r.date)}{r.time ? ` ${r.time}` : ''}</td>
                          <td>{r.party ?? '—'}</td>
                          <td>{r.document ?? '—'}</td>
                          <td>{SOURCE_LABEL[r.source]}</td>
                          <td>{METHOD_LABEL[r.method]}{r.card_last4 ? ` ••${r.card_last4}` : ''}</td>
                          <td>{r.account ?? '—'}</td>
                          <td>{r.reference ?? '—'}</td>
                          <td className="num nowrap">{formatBDT(r.amount)}</td>
                        </tr>
                      ))}
                      <tr className="total">
                        <td colSpan={7}>{nf(rows.length)} payment{rows.length === 1 ? '' : 's'}</td>
                        <td className="num">{formatBDT(shown)}</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )
            })()}
          </section>
        )}

        {/* ── Outstanding dues ──────────────────────────────────────── */}
        {has('dues') && (
          <section className="rpt-section">
            <h2>Outstanding dues</h2>
            {!dues ? <Failed what="dues" /> : (
              <>
                <p className="rpt-note">
                  A snapshot as of <strong>{formatDate(dues.asOf)}</strong> — not the report period.
                  A balance is late relative to today, so this section always shows the current
                  position. Aged from the day the guest left.
                </p>
                <table>
                  <thead><tr>
                    <th>Age</th><th className="num">Bookings</th><th className="num">Outstanding</th>
                  </tr></thead>
                  <tbody>
                    {dues.buckets.map((b) => (
                      <tr key={b.label}>
                        <td>{b.label}</td>
                        <td className="num">{nf(b.count)}</td>
                        <td className="num">{formatBDT(b.total)}</td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td>{duesMinDays > 1 ? `${duesMinDays}+ days overdue` : 'All overdue'}</td>
                      <td className="num">{nf(dues.rows.length)}</td>
                      <td className="num">{formatBDT(dues.totalOverdue)}</td>
                    </tr>
                  </tbody>
                </table>
                <table className="dense">
                  <thead><tr>
                    <th className="num">Days</th><th>Guest</th><th>Booking</th><th>Left</th>
                    <th>Phone</th><th className="num">Bill</th><th className="num">Paid</th>
                    <th className="num">Still owed</th>
                  </tr></thead>
                  <tbody>
                    {dues.rows.map((r) => (
                      <tr key={r.booking_id}>
                        <td className="num">{r.days_overdue}</td>
                        <td>{r.customer_name}{r.is_corporate && r.company_name ? ` (${r.company_name})` : ''}</td>
                        <td>{r.booking_number}</td>
                        <td className="nowrap">{formatDateShort(r.due_since)}</td>
                        <td className="nowrap">{r.customer_phone}</td>
                        <td className="num">{formatBDT(r.total_bill)}</td>
                        <td className="num">{formatBDT(r.collected)}</td>
                        <td className="num nowrap"><strong>{formatBDT(r.outstanding)}</strong></td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td colSpan={7}>{nf(dues.rows.length)} booking{dues.rows.length === 1 ? '' : 's'} to chase</td>
                      <td className="num">{formatBDT(dues.totalOverdue)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </section>
        )}

        {/* ── Cash checkout ─────────────────────────────────────────── */}
        {has('cash') && (
          <section className="rpt-section">
            <h2>Cash checkout</h2>
            {!cash ? <Failed what="cash checkout" /> : (
              <>
                <p className="rpt-note">
                  Cash taken at checkout only — no advances, cards, transfers or coffee-shop
                  tender. This total is what should have been counted in the drawer.
                </p>
                <table className="dense">
                  <thead><tr>
                    <th>Date</th><th>Booking</th><th>Guest</th><th className="num">Cash</th>
                  </tr></thead>
                  <tbody>
                    {cash.rows.map((r) => (
                      <tr key={r.id}>
                        <td className="nowrap">{formatDateShort(r.date)}</td>
                        <td>{r.booking_number}</td>
                        <td>{r.customer_name}</td>
                        <td className="num nowrap"><strong>{formatBDT(r.amount)}</strong></td>
                      </tr>
                    ))}
                    <tr className="total">
                      <td colSpan={3}>{nf(cash.rows.length)} payment{cash.rows.length === 1 ? '' : 's'}</td>
                      <td className="num">{formatBDT(cash.total)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}
          </section>
        )}

        {/* ── Guests ────────────────────────────────────────────────── */}
        {has('guests') && (
          <section className="rpt-section">
            <h2>Guests</h2>
            {!guests ? <Failed what="guest" /> : (
              <>
                <div className="rpt-kpis">
                  <div className="rpt-kpi"><span>Guests served</span><b>{nf(guests.totals.guests)}</b>
                    <small>{nf(guests.totals.adults)} adults · {nf(guests.totals.children_paid + guests.totals.children_free)} children</small></div>
                  <div className="rpt-kpi"><span>Bookings</span><b>{nf(guests.totals.bookings)}</b>
                    <small>{(guests.totals.guests / days).toFixed(1)} guests / day</small></div>
                  <div className="rpt-kpi"><span>Daylong</span><b>{nf(guests.totals.daylong_guests)}</b>
                    <small>{nf(guests.totals.daylong_bookings)} bookings</small></div>
                  <div className="rpt-kpi"><span>Night stays</span><b>{nf(guests.totals.night_guests)}</b>
                    <small>{nf(guests.totals.night_bookings)} bookings · {nf(guests.totals.drivers)} drivers overall</small></div>
                </div>
                {busiest && busiest.guests > 0 && (
                  <p className="rpt-note">Busiest day: <strong>{formatDate(busiest.date)}</strong> — {nf(busiest.guests)} guests across {nf(busiest.bookings)} bookings.</p>
                )}
              </>
            )}
          </section>
        )}

        {/* ── Occupancy ─────────────────────────────────────────────── */}
        {has('operations') && (
          <section className="rpt-section">
            <h2>Occupancy</h2>
            {!occupancy || occupancy.length === 0 ? <Failed what="occupancy" /> : (
              <div className="rpt-kpis">
                <div className="rpt-kpi"><span>Average</span><b>{(occPcts.reduce((s, n) => s + n, 0) / Math.max(1, occPcts.length)).toFixed(1)}%</b></div>
                <div className="rpt-kpi"><span>Peak day</span><b>{Math.max(0, ...occPcts).toFixed(1)}%</b></div>
                <div className="rpt-kpi"><span>Lowest day</span><b>{Math.min(100, ...occPcts).toFixed(1)}%</b></div>
                <div className="rpt-kpi"><span>ADR · RevPAR</span>
                  <b>{industry?.adr != null ? formatBDT(industry.adr) : '—'}</b>
                  <small>RevPAR {industry?.revpar != null ? formatBDT(industry.revpar) : '—'}</small></div>
              </div>
            )}
          </section>
        )}

        {/* ── Expenses ──────────────────────────────────────────────── */}
        {has('expenses') && (
          <section className="rpt-section">
            <h2>Expenses</h2>
            {!catBreakdown ? <Failed what="expense" /> : (
              <table>
                <thead><tr><th>Category group</th><th className="num">Spend</th><th className="num">% of total</th></tr></thead>
                <tbody>
                  {catBreakdown.groups.map((g) => (
                    <tr key={g.group}>
                      <td style={{ textTransform: 'capitalize' }}>{g.group.replace(/_/g, ' ')}</td>
                      <td className="num">{formatBDT(g.total)}</td>
                      <td className="num">{g.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total</td>
                    <td className="num">{formatBDT(catBreakdown.groups.reduce((s, g) => s + g.total, 0))}</td>
                    <td className="num">100%</td>
                  </tr>
                </tbody>
              </table>
            )}
            {vendors && vendors.length > 0 && (
              <table>
                <thead><tr><th>Top payees</th><th className="num">Payments</th><th className="num">Total</th></tr></thead>
                <tbody>
                  {vendors.slice(0, 8).map((v) => (
                    <tr key={v.payee_name}>
                      <td>{v.payee_name}</td>
                      <td className="num">{nf(v.transactions)}</td>
                      <td className="num">{formatBDT(v.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* ── Profit & loss ─────────────────────────────────────────── */}
        {has('profitability') && (
          <section className="rpt-section">
            <h2>Profit &amp; loss by month</h2>
            {!pnl || pnl.length === 0 ? <Failed what="profit and loss" /> : (
              <table>
                <thead><tr>
                  <th>Month</th><th className="num">Income</th><th className="num">Expenses</th>
                  <th className="num">Net</th><th className="num">Margin</th>
                </tr></thead>
                <tbody>
                  {pnl.map((m) => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td>
                      <td className="num">{formatBDT(m.income)}</td>
                      <td className="num">{formatBDT(m.expenses)}</td>
                      <td className="num" style={{ color: m.net >= 0 ? '#166534' : '#b91c1c' }}>{formatBDT(m.net)}</td>
                      <td className="num">{m.margin_pct == null ? '—' : `${m.margin_pct.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                  <tr className="total">
                    <td>Total</td>
                    <td className="num">{formatBDT(pnl.reduce((s, m) => s + m.income, 0))}</td>
                    <td className="num">{formatBDT(pnl.reduce((s, m) => s + m.expenses, 0))}</td>
                    <td className="num">{formatBDT(pnl.reduce((s, m) => s + m.net, 0))}</td>
                    <td className="num" />
                  </tr>
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* ── HR & payroll ──────────────────────────────────────────── */}
        {has('hr') && (
          <section className="rpt-section">
            <h2>HR &amp; payroll</h2>
            {attendance && (
              <div className="rpt-kpis">
                <div className="rpt-kpi"><span>Attendance rate</span><b>{attendance.totals.attendance_rate_pct.toFixed(1)}%</b></div>
                <div className="rpt-kpi"><span>Absent days</span><b>{nf(attendance.totals.total_absent_days)}</b></div>
                <div className="rpt-kpi"><span>Leave days</span><b>{nf(attendance.totals.total_leave_days)}</b></div>
                <div className="rpt-kpi"><span>Top absentee</span>
                  <b style={{ fontSize: '10pt' }}>{attendance.topAbsentees[0]?.full_name ?? '—'}</b>
                  <small>{attendance.topAbsentees[0] ? `${attendance.topAbsentees[0].absent_days} days absent` : ''}</small></div>
              </div>
            )}
            {!salary || salary.length === 0 ? (!attendance ? <Failed what="HR" /> : null) : (
              <table>
                <thead><tr>
                  <th>Month</th><th className="num">Revenue</th><th className="num">Payroll</th><th className="num">Salary %</th>
                </tr></thead>
                <tbody>
                  {salary.map((m) => (
                    <tr key={m.month}>
                      <td>{monthLabel(m.month)}</td>
                      <td className="num">{formatBDT(m.revenue)}</td>
                      <td className="num">{m.payroll_total == null ? 'not finalized' : formatBDT(m.payroll_total)}</td>
                      <td className="num">{m.salary_pct == null ? '—' : `${m.salary_pct.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}

        {/* ── Guest extras ──────────────────────────────────────────── */}
        {has('extras') && (
          <section className="rpt-section">
            <h2>Guest extras (checkout charges)</h2>
            {!extras ? <Failed what="extras" /> : (
              <>
                <div className="rpt-kpis">
                  <div className="rpt-kpi"><span>Extras revenue</span><b>{formatBDT(extras.total_extras_revenue)}</b></div>
                  <div className="rpt-kpi"><span>Finalized checkouts</span><b>{nf(extras.finalized_checkouts)}</b></div>
                  <div className="rpt-kpi"><span>Per guest</span><b>{formatBDT(extras.avg_extras_per_guest)}</b></div>
                  <div className="rpt-kpi"><span>Food &amp; beverage share</span><b>{formatBDT(extras.fb_revenue)}</b></div>
                </div>
                {topCharges && topCharges.length > 0 && (
                  <table>
                    <thead><tr>
                      <th>Top items</th><th>Category</th><th className="num">Times sold</th><th className="num">Revenue</th>
                    </tr></thead>
                    <tbody>
                      {topCharges.map((t) => (
                        <tr key={`${t.item_name}-${t.category}`}>
                          <td>{t.item_name}</td>
                          <td>{t.category}</td>
                          <td className="num">{nf(t.times_sold)}</td>
                          <td className="num">{formatBDT(t.total_revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </section>
        )}

        {/* ── Coffee shop ───────────────────────────────────────────── */}
        {has('coffee') && (
          <section className="rpt-section">
            <h2>Coffee shop</h2>
            {!coffee ? <Failed what="coffee shop" /> : (
              <>
                <div className="rpt-kpis">
                  <div className="rpt-kpi"><span>Net revenue</span><b>{formatBDT(coffee.net_revenue)}</b>
                    <small>{nf(coffee.sales_count)} sales · avg {formatBDT(coffee.avg_sale)}</small></div>
                  <div className="rpt-kpi"><span>Complimentary</span><b>{formatBDT(coffee.comp_value)}</b></div>
                  <div className="rpt-kpi"><span>Discounts</span><b>{formatBDT(coffee.total_discount)}</b></div>
                  <div className="rpt-kpi"><span>Voided</span><b>{nf(coffee.voided_count)}</b>
                    <small>{formatBDT(coffee.voided_value)}</small></div>
                </div>
                {coffee.top_items.length > 0 && (
                  <table>
                    <thead><tr>
                      <th>Top sellers</th><th>Category</th><th className="num">Units</th><th className="num">Revenue</th>
                    </tr></thead>
                    <tbody>
                      {coffee.top_items.slice(0, 5).map((t) => (
                        <tr key={t.name}>
                          <td>{t.name}</td><td>{t.category}</td>
                          <td className="num">{nf(t.units_sold)}</td>
                          <td className="num">{formatBDT(t.revenue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </section>
        )}

        <p className="rpt-foot">
          Garden Centre Resort · Management report {formatDate(fromIso)} – {formatDate(toIso)} ·
          booked-basis figures; cancellations and no-shows excluded where applicable.
        </p>
      </div>
    </>
  )
}
