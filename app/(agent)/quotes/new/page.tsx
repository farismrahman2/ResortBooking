import { Topbar } from '@/components/layout/Topbar'
import { QuoteForm } from '@/components/quotes/QuoteForm'
import { getActivePackagesWithPrices } from '@/lib/queries/packages'
import { getRoomInventory, getSettings, getHolidayDates } from '@/lib/queries/settings'

export const dynamic = 'force-dynamic'

export default async function NewQuotePage() {
  const [packages, rooms, settings, holidays] = await Promise.all([
    getActivePackagesWithPrices(),
    getRoomInventory(),
    getSettings(),
    getHolidayDates(),
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
        />
      </div>
    </div>
  )
}
