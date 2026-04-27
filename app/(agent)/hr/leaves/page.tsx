import { Topbar } from '@/components/layout/Topbar'
import { MigrationErrorBanner } from '@/components/hr/MigrationErrorBanner'
import { LeaveBalanceTable } from '@/components/hr/LeaveBalanceTable'
import { InitializeYearButton } from './InitializeYearButton'
import { getLeaveBalancesForYear } from '@/lib/queries/leaves'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { year?: string }
}

export default async function LeavesPage({ searchParams }: PageProps) {
  const year = searchParams.year && /^\d{4}$/.test(searchParams.year)
    ? Number(searchParams.year)
    : new Date().getFullYear()

  let migrationError: string | null = null
  let rows: Awaited<ReturnType<typeof getLeaveBalancesForYear>> = []
  try {
    rows = await getLeaveBalancesForYear(year)
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Leaves" subtitle={`Balances for ${year}`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError && <MigrationErrorBanner error={migrationError} />}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-sm text-gray-500">
            <span className="font-medium text-gray-700">{rows.length}</span> balance rows for {year}
          </p>
          <InitializeYearButton year={year} />
        </div>

        <LeaveBalanceTable rows={rows} />
      </div>
    </div>
  )
}
