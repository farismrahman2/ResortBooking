import { Topbar } from '@/components/layout/Topbar'
import { PayeeManager } from '@/components/expenses/PayeeManager'
import { getAllPayees } from '@/lib/queries/expenses'

export const dynamic = 'force-dynamic'

export default async function PayeesPage() {
  const payees = await getAllPayees()

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Payees" subtitle="Vendors, contractors, staff, utilities" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <PayeeManager payees={payees} />
        </div>
      </div>
    </div>
  )
}
