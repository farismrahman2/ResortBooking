import { requirePermission } from '@/lib/auth/permissions'
import { getDailyReport, computeFreeRooms } from '@/lib/queries/daily-report'
import { DailyReportPrint } from '@/components/print/DailyReportPrint'
import type { Lang } from '@/lib/i18n/daily-report'
import { listBlocksOverlapping } from '@/lib/queries/room-blocks'
import { blockedNumbersOn } from '@/lib/engine/blocks'
import { getRoomInventory } from '@/lib/queries/settings'
import { addDaysIso } from '@/lib/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { date?: string; lang?: string }
}

export default async function DailyReportPrintPage({ searchParams }: PageProps) {
  // Gate via the same permission as the availability page.
  await requirePermission('availability', 'read')

  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
    ? searchParams.date
    : new Date().toISOString().slice(0, 10)

  const lang: Lang = searchParams.lang === 'bn' ? 'bn' : 'en'

  const [rows, blocks, inventory] = await Promise.all([
    getDailyReport(date), listBlocksOverlapping(date, addDaysIso(date, 1)), getRoomInventory(),
  ])
  const free  = computeFreeRooms(rows, blockedNumbersOn(blocks, [date], inventory))

  return <DailyReportPrint date={date} lang={lang} rows={rows} free={free} />
}
