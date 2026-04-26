import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { MonthlyExcelGrid } from '@/components/expenses/MonthlyExcelGrid'
import { MonthSelectorBar } from './MonthSelectorBar'
import { getMonthlyExpenseSummary } from '@/lib/queries/expenses'
import { Printer, Download } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { month?: string }
}

function currentMonthIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function ReportPage({ searchParams }: PageProps) {
  const month = searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)
    ? searchParams.month
    : currentMonthIso()

  let summary
  try {
    summary = await getMonthlyExpenseSummary(month)
  } catch (err) {
    return (
      <div className="flex h-full flex-col">
        <Topbar title="Monthly Report" />
        <div className="px-6 py-6">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Could not load report. Make sure migration <code className="font-mono">003_expense_pivot_rpc.sql</code> has been run in Supabase.
            <br />
            <span className="text-xs">{err instanceof Error ? err.message : String(err)}</span>
          </div>
        </div>
      </div>
    )
  }

  // CSV export uses /api/expenses/csv-export which expects from/to ISO dates
  const csvHref = `/api/expenses/csv-export?from=${summary.from}&to=${summary.to}`

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Monthly Report" subtitle={`${monthLabel(month)} · ${summary.days.length} days`} />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-7xl space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <MonthSelectorBar month={month} />
            <div className="flex items-center gap-2">
              <a href={csvHref}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download size={13} />
                  Export CSV
                </Button>
              </a>
              <Link href={`/expenses/report/print?month=${month}`} target="_blank">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Printer size={13} />
                  Print / PDF
                </Button>
              </Link>
            </div>
          </div>

          {/* Header summary card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryStat label="Days with spend" value={`${summary.days.filter((d) => d.day_total > 0).length} / ${summary.days.length}`} />
            <SummaryStat label="Highest day"     value={highestDay(summary)} />
            <SummaryStat label="Categories used" value={`${Object.keys(summary.category_totals).length} / ${summary.categories.length}`} />
            <SummaryStat label="Grand Total"     value={`৳${summary.grand_total.toLocaleString('en-IN')}`} accent="rose" />
          </div>

          <MonthlyExcelGrid summary={summary} />
        </div>
      </div>
    </div>
  )
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

function highestDay(summary: { days: { date: string; day_total: number }[] }): string {
  const top = [...summary.days].sort((a, b) => b.day_total - a.day_total)[0]
  if (!top || top.day_total === 0) return '—'
  const day = top.date.slice(8, 10)
  return `Day ${day} · ৳${top.day_total.toLocaleString('en-IN')}`
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: 'rose' }) {
  const cls = accent === 'rose'
    ? 'border-rose-200 bg-rose-50 text-rose-900'
    : 'border-gray-200 bg-white text-gray-800'
  return (
    <div className={`rounded-lg border px-3 py-2 ${cls}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-0.5 font-mono text-sm font-bold tabular-nums">{value}</p>
    </div>
  )
}
