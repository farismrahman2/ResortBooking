import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getUniqueGuestNumbers } from '@/lib/queries/guest-numbers'
import { GuestNumbersClient } from '@/components/settings/GuestNumbersClient'

export const dynamic = 'force-dynamic'

export default async function GuestNumbersPage() {
  await requirePermission('settings', 'read')
  const numbers = await getUniqueGuestNumbers()

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Guest Phone Numbers"
        subtitle="Every unique number from quotes & bookings — for WhatsApp broadcasts and marketing"
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <GuestNumbersClient numbers={numbers} />
      </div>
    </div>
  )
}
