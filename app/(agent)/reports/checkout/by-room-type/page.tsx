import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getExtrasByRoomType, type ExtrasByRoomTypeRow } from '@/lib/queries/reports/checkout'
import { ReportShell } from '@/components/reports/ReportShell'
import { SimpleTable } from '@/components/reports/SimpleTable'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function ByRoomTypePage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const checkoutAccess = await hasPermission('checkout', 'read')
  if (!checkoutAccess) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">Checkout access required to view this report.</div>
      </div>
    )
  }
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const rows = await getExtrasByRoomType(period)

  return (
    <ReportShell exportReportId="checkout-by-room-type" title="Extras by room type" subtitle="Which room types upsell more" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <SimpleTable<ExtrasByRoomTypeRow>
        rows={rows}
        columns={[
          { key: 'room_type',           label: 'Room type', render: (r) => r.room_type.replace(/_/g, ' ') },
          { key: 'finalized_checkouts', label: 'Checkouts', align: 'right' },
          { key: 'extras_revenue',      label: 'Extras revenue', align: 'right', render: (r) => formatBDT(r.extras_revenue) },
          { key: 'avg_per_checkout',    label: 'Avg per checkout', align: 'right', render: (r) => formatBDT(r.avg_per_checkout) },
        ]}
      />
    </ReportShell>
  )
}
