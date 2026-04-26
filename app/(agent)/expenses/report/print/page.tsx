import { MonthlyExcelGrid } from '@/components/expenses/MonthlyExcelGrid'
import { getMonthlyExpenseSummary } from '@/lib/queries/expenses'
import { formatBDT } from '@/lib/formatters/currency'
import { PrintTrigger } from './PrintTrigger'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { month?: string }
}

function currentMonthIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function ReportPrintPage({ searchParams }: PageProps) {
  const month = searchParams.month && /^\d{4}-\d{2}$/.test(searchParams.month)
    ? searchParams.month
    : currentMonthIso()

  let summary
  try {
    summary = await getMonthlyExpenseSummary(month)
  } catch (err) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-700">Could not load report. {err instanceof Error ? err.message : String(err)}</p>
      </div>
    )
  }

  const [y, m] = month.split('-').map(Number)
  const label = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-white">
      <style>{`
        @media print {
          @page { size: A3 landscape; margin: 12mm; }
          .no-print { display: none !important; }
          nav, aside, [data-sidebar], [data-topbar] { display: none !important; }
          body { font-size: 10px; background: white !important; }
        }
      `}</style>

      <PrintTrigger />

      <div className="mx-auto max-w-[1400px] px-6 py-6 print:p-0">
        <div className="mb-4 flex items-end justify-between border-b border-gray-300 pb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Garden Centre Resort — Monthly Expenses</h1>
            <p className="text-sm text-gray-600">{label}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">Grand Total</p>
            <p className="font-mono text-lg font-bold text-rose-900 tabular-nums">{formatBDT(summary.grand_total)}</p>
          </div>
        </div>

        <MonthlyExcelGrid summary={summary} printMode />

        <p className="mt-4 text-[10px] text-gray-400 italic no-print">
          Generated {new Date().toLocaleString('en-GB')}. Excludes drafts.
        </p>
      </div>
    </div>
  )
}
