import { Topbar } from '@/components/layout/Topbar'
import { MigrationErrorBanner } from '@/components/hr/MigrationErrorBanner'
import { LeaveTypeManager } from '@/components/hr/LeaveTypeManager'
import { getAllLeaveTypes } from '@/lib/queries/leaves'

export const dynamic = 'force-dynamic'

export default async function LeaveTypesPage() {
  let migrationError: string | null = null
  let rows: Awaited<ReturnType<typeof getAllLeaveTypes>> = []
  try {
    rows = await getAllLeaveTypes()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Leave Types" subtitle="Configure annual entitlements per leave category" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError && <MigrationErrorBanner error={migrationError} />}
        <div className="mx-auto w-full max-w-4xl">
          <LeaveTypeManager rows={rows} />
        </div>
      </div>
    </div>
  )
}
