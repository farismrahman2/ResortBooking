import { getSettings, getHolidayDates } from '@/lib/queries/settings'
import { Topbar } from '@/components/layout/Topbar'
import { SettingsForm } from '@/components/settings/SettingsForm'
import { HolidayManager } from '@/components/settings/HolidayManager'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const [settings, holidays] = await Promise.all([
    getSettings(),
    getHolidayDates(),
  ])

  return (
    <div className="flex flex-col">
      <Topbar title="Settings" />
      <div className="p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 max-w-5xl">
          {/* Left: General settings */}
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
            </CardHeader>
            <SettingsForm initialSettings={settings} />
          </Card>

          {/* Right: Holiday dates */}
          <Card>
            <CardHeader>
              <CardTitle>Holiday Dates</CardTitle>
            </CardHeader>
            <HolidayManager initialHolidays={holidays} />
          </Card>
        </div>
      </div>
    </div>
  )
}
