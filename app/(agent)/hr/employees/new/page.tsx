import { Topbar } from '@/components/layout/Topbar'
import { EmployeeForm } from '@/components/hr/EmployeeForm'
import { MigrationErrorBanner } from '@/components/hr/MigrationErrorBanner'
import { suggestEmployeeCode } from '@/lib/queries/employees'

export const dynamic = 'force-dynamic'

export default async function NewEmployeePage() {
  let suggested: string = 'GCR-001'
  let migrationError: string | null = null
  try {
    suggested = await suggestEmployeeCode()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Add Employee" subtitle="Create a new staff record" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-4">
          {migrationError && <MigrationErrorBanner error={migrationError} />}
          <EmployeeForm suggestedCode={suggested} />
        </div>
      </div>
    </div>
  )
}
