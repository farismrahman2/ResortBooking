import { Topbar } from '@/components/layout/Topbar'
import { QuoteForm } from '@/components/quotes/QuoteForm'
import { getActivePackagesWithPrices } from '@/lib/queries/packages'
import { getRoomInventory, getSettings, getHolidayDates } from '@/lib/queries/settings'
import { listSalesEmployees } from '@/lib/queries/employees'
import { listAccounts } from '@/lib/queries/crm'
import type { CorporateAccountOption } from '@/components/quotes/CorporateBookingFields'
import type { SalesEmployee } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function NewQuotePage() {
  const [packages, rooms, settings, holidays] = await Promise.all([
    getActivePackagesWithPrices(),
    getRoomInventory(),
    getSettings(),
    getHolidayDates(),
  ])

  // Best-effort — works even if HR migration 001 hasn't been run yet
  let salesEmployees: SalesEmployee[] = []
  try { salesEmployees = await listSalesEmployees() } catch { salesEmployees = [] }

  // Best-effort — CRM module may not be installed; the dropdown gracefully
  // hides when corporateAccounts is empty.
  let corporateAccounts: CorporateAccountOption[] = []
  try {
    const accs = await listAccounts({ ownerView: 'all' })
    corporateAccounts = accs.map((a) => ({ id: a.id, company_name: a.company_name, account_code: a.account_code }))
  } catch { corporateAccounts = [] }

  const holidayDates = holidays.map((h) => h.date)

  return (
    <div className="flex h-full flex-col">
      <Topbar title="New Quote" subtitle="Create a new customer quote" />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <QuoteForm
          packages={packages}
          rooms={rooms}
          holidayDates={holidayDates}
          settings={settings}
          salesEmployees={salesEmployees}
          corporateAccounts={corporateAccounts}
        />
      </div>
    </div>
  )
}
