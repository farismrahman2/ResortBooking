import { notFound, redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { QuoteForm } from '@/components/quotes/QuoteForm'
import { getQuoteById } from '@/lib/queries/quotes'
import { getActivePackagesWithPrices } from '@/lib/queries/packages'
import { getRoomInventory, getSettings, getHolidayDates } from '@/lib/queries/settings'

export const dynamic = 'force-dynamic'

const ROOM_LABELS: Record<string, string> = {
  cottage:        'Cottage',
  eco_deluxe:     'Eco Deluxe',
  deluxe:         'Deluxe',
  premium_deluxe: 'Premium Deluxe',
  premium:        'Premium',
  super_premium:  'Super Premium',
  tree_house:     'Tree House',
}

interface PageProps {
  params: { id: string }
}

export default async function EditQuotePage({ params }: PageProps) {
  const [quote, packages, rooms, settings, holidays] = await Promise.all([
    getQuoteById(params.id),
    getActivePackagesWithPrices(),
    getRoomInventory(),
    getSettings(),
    getHolidayDates(),
  ])

  if (!quote) notFound()

  // Only draft and sent quotes can be edited
  if (!['draft', 'sent'].includes(quote.status)) {
    redirect(`/quotes/${params.id}`)
  }

  const holidayDates = holidays.map((h) => h.date)

  // Map stored quote_rooms → RoomSelection[]
  const prefilledRooms = quote.rooms.map((r) => ({
    room_type:    r.room_type,
    display_name: ROOM_LABELS[r.room_type] ?? r.room_type.replace(/_/g, ' '),
    qty:          r.qty,
    unit_price:   r.unit_price,
    room_numbers: r.room_numbers ?? [],
  }))

  const initialValues = {
    customer_name:      quote.customer_name,
    customer_phone:     quote.customer_phone,
    customer_notes:     quote.customer_notes ?? '',
    package_id:         quote.package_snapshot.package_id,
    package_type:       quote.package_type,
    visit_date:         quote.visit_date,
    check_out_date:     quote.check_out_date ?? '',
    adults:             quote.adults,
    children_paid:      quote.children_paid,
    children_free:      quote.children_free,
    drivers:            quote.drivers,
    extra_beds:         quote.extra_beds,
    rooms:              prefilledRooms,
    discount:           quote.discount,
    service_charge_pct: quote.service_charge_pct ?? 0,
    advance_required:   quote.advance_required,
    advance_paid:       quote.advance_paid,
  }

  const initialExtraItems = (quote as any).extra_items ?? []

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title={`Edit ${quote.quote_number}`}
        subtitle="Update quote details and pricing"
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <QuoteForm
          packages={packages}
          rooms={rooms}
          holidayDates={holidayDates}
          settings={settings}
          quoteId={params.id}
          initialValues={initialValues}
          initialExtraItems={initialExtraItems}
        />
      </div>
    </div>
  )
}
