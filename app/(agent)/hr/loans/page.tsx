import { Topbar } from '@/components/layout/Topbar'
import { MigrationErrorBanner } from '@/components/hr/MigrationErrorBanner'
import { LoansTable } from '@/components/hr/LoansTable'
import { LoanForm } from '@/components/hr/LoanForm'
import { getLoans } from '@/lib/queries/loans'
import { getEmployees } from '@/lib/queries/employees'

export const dynamic = 'force-dynamic'

export default async function LoansPage() {
  let migrationError: string | null = null
  let loans: Awaited<ReturnType<typeof getLoans>> = []
  let employees: Awaited<ReturnType<typeof getEmployees>> = []
  try {
    [loans, employees] = await Promise.all([
      getLoans({}),
      getEmployees({ limit: 100 }),
    ])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Loans" subtitle="Multi-month staff loans" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError && <MigrationErrorBanner error={migrationError} />}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2"><LoansTable rows={loans} /></div>
          <div><LoanForm employees={employees.map((e) => ({
            id: e.id, employee_code: e.employee_code, full_name: e.full_name,
          }))} /></div>
        </div>
      </div>
    </div>
  )
}
