import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { MigrationErrorBanner } from '@/components/inventory/MigrationErrorBanner'
import {
  getStockOnHand, getConsumptionByCategory, getCostOfGoods, getWastage, getSlowMoving, type DateRange,
} from '@/lib/queries/reports/inventory'
import { formatBDT } from '@/lib/formatters/currency'
import { formatQty } from '@/components/inventory/labels'

export const dynamic = 'force-dynamic'

function monthRange(offset = 0): DateRange {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const last  = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { from: iso(first), to: iso(last) }
}

export default async function InventoryReportsPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  await requirePermission('inventory', 'read')

  const range: DateRange = (searchParams.from && searchParams.to)
    ? { from: searchParams.from, to: searchParams.to }
    : monthRange(0)

  let migrationError: string | null = null
  let soh: Awaited<ReturnType<typeof getStockOnHand>> | null = null
  let consumption: Awaited<ReturnType<typeof getConsumptionByCategory>> | null = null
  let cogs: Awaited<ReturnType<typeof getCostOfGoods>> | null = null
  let wastage: Awaited<ReturnType<typeof getWastage>> | null = null
  let slow: Awaited<ReturnType<typeof getSlowMoving>> = []

  try {
    [soh, consumption, cogs, wastage, slow] = await Promise.all([
      getStockOnHand(),
      getConsumptionByCategory(range),
      getCostOfGoods(range),
      getWastage(range),
      getSlowMoving(60),
    ])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  const thisMonth = monthRange(0)
  const lastMonth = monthRange(-1)

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Inventory Reports" subtitle={`${range.from} → ${range.to}`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <RangeLink label="This month" range={thisMonth} active={range.from === thisMonth.from} />
              <RangeLink label="Last month" range={lastMonth} active={range.from === lastMonth.from} />
            </div>

            {/* Cost of goods / food cost */}
            <Section title="Cost of Goods Consumed — Kitchen">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Kpi label="Kitchen COGS" value={formatBDT(cogs!.kitchen_cogs)} />
                <Kpi label="F&B revenue (coffee shop)" value={formatBDT(cogs!.fnb_revenue)} />
                <Kpi label="Food cost %"
                  value={cogs!.food_cost_pct != null ? `${cogs!.food_cost_pct}%` : '—'}
                  note="Benchmark 28–35%" />
              </div>
            </Section>

            {/* Stock on hand */}
            <Section title={`Stock on Hand · ${formatBDT(soh!.total)} total`}>
              <ReportTable
                head={['Store', 'Category', 'SKUs', 'Value']}
                rows={soh!.rows.map((r) => [r.store, r.category, String(r.skus), formatBDT(r.value)])}
                rightAlign={[2, 3]}
              />
            </Section>

            {/* Consumption */}
            <Section title={`Consumption by Category · ${formatBDT(consumption!.total)}`}>
              <ReportTable
                head={['Category', 'Qty', 'Value']}
                rows={consumption!.rows.map((r) => [r.category, formatQty(r.quantity), formatBDT(r.value)])}
                rightAlign={[1, 2]}
              />
            </Section>

            {/* Wastage */}
            <Section title={`Wastage · ${formatBDT(wastage!.total)}`}>
              <ReportTable
                head={['Reason', 'Qty', 'Value']}
                rows={wastage!.rows.map((r) => [r.reason, formatQty(r.quantity), formatBDT(r.value)])}
                rightAlign={[1, 2]}
              />
            </Section>

            {/* Slow moving */}
            <Section title="Slow-Moving (no issue in 60+ days)">
              <ReportTable
                head={['Item', 'SKU', 'In stock', 'Last issued']}
                rows={slow.map((r) => [r.name, r.sku_code, formatQty(r.current_stock, r.unit_abbr), r.last_issued ?? 'never'])}
                rightAlign={[2]}
              />
            </Section>

            <Link href="/inventory" className="inline-block text-sm text-teal-700 hover:underline">← Back to Inventory</Link>
          </>
        )}
      </div>
    </div>
  )
}

function RangeLink({ label, range, active }: { label: string; range: DateRange; active: boolean }) {
  return (
    <Link href={`/inventory/reports?from=${range.from}&to=${range.to}`}
      className={`rounded-full px-3 py-1 ${active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
      {label}
    </Link>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  )
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-gray-900">{value}</p>
      {note && <p className="mt-0.5 text-[10px] text-gray-400">{note}</p>}
    </div>
  )
}

function ReportTable({ head, rows, rightAlign = [] }: { head: string[]; rows: string[][]; rightAlign?: number[] }) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">No data for this period.</div>
  }
  const ra = new Set(rightAlign)
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>{head.map((h, i) => <th key={i} className={`px-4 py-2 font-medium ${ra.has(i) ? 'text-right' : ''}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => <td key={ci} className={`px-4 py-2 ${ra.has(ci) ? 'text-right tabular-nums' : 'text-gray-700'} capitalize`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
