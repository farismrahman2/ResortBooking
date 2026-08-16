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
  // All six reads are independent — one round of parallel fetches instead of
  // three. The last two stay best-effort: sales employees need HR migration
  // 001, corporate accounts need the CRM module.
  const [packages, rooms, settings, holidays, salesEmployees, corporateAccounts] = await Promise.all([
    getActivePackagesWithPrices(),
    getRoomInventory(),
    getSettings(),
    getHolidayDates(),
    listSalesEmployees().catch(() => [] as SalesEmployee[]),
    listAccounts({ ownerView: 'all' })
      .then((accs) => accs.map((a): CorporateAccountOption => ({ id: a.id, company_name: a.company_name, account_code: a.account_code })))
      .catch(() => [] as CorporateAccountOption[]),
  ])

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
