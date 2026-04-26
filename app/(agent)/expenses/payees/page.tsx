import { Topbar } from '@/components/layout/Topbar'
import { PayeeManager } from '@/components/expenses/PayeeManager'
import { MigrationErrorBanner } from '@/components/expenses/MigrationErrorBanner'
import { getAllPayees } from '@/lib/queries/expenses'

export const dynamic = 'force-dynamic'

export default async function PayeesPage() {
  let payees: Awaited<ReturnType<typeof getAllPayees>> = []
  let migrationError: string | null = null
  try {
    payees = await getAllPayees()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Payees" subtitle="Vendors, contractors, staff, utilities" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl">
          {migrationError ? <MigrationErrorBanner error={migrationError} /> : <PayeeManager payees={payees} />}
        </div>
      </div>
    </div>
  )
}
