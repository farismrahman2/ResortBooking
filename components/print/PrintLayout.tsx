import { formatBDT } from '@/lib/formatters/currency'
import { formatDate, formatDateRange } from '@/lib/formatters/dates'
import type { QuoteWithRooms, BookingWithRooms, SettingsMap, RoomType } from '@/lib/supabase/types'

interface PrintLayoutProps {
  quote?:   QuoteWithRooms
  booking?: BookingWithRooms
  settings: SettingsMap
}

// Derive a unified record from either quote or booking
type PrintRecord = QuoteWithRooms | BookingWithRooms

function isQuote(r: PrintRecord): r is QuoteWithRooms {
  return 'quote_number' in r
}

const ROOM_LABELS: Record<RoomType, string> = {
  cottage:        'Cottage',
  eco_deluxe:     'Eco Deluxe',
  deluxe:         'Deluxe',
  premium_deluxe: 'Premium Deluxe',
  premium:        'Premium',
  super_premium:  'Super Premium',
  tree_house:     'Tree House',
}

export function PrintLayout({ quote, booking, settings }: PrintLayoutProps) {
  const record: PrintRecord | undefined = quote ?? booking
  if (!record) return null

  const refNumber     = isQuote(record) ? record.quote_number : record.booking_number
  const docType       = isQuote(record) ? 'QUOTATION' : 'BOOKING CONFIRMATION'
  const resortName    = settings['resort_name']         ?? 'Garden Centre Resort'
  const contactNums   = settings['contact_numbers']     ?? ''
  const paymentInfo   = settings['payment_instructions'] ?? ''
  const footerText    = settings['print_footer_text']   ?? settings['whatsapp_footer_text'] ?? ''

  const dateLine =
    record.package_type === 'night' && record.check_out_date
      ? formatDateRange(record.visit_date, record.check_out_date)
      : formatDate(record.visit_date)

  const rooms = record.rooms

  // Guest summary parts
  const guestParts: string[] = []
  if (record.adults > 0) guestParts.push(`${record.adults} Adult${record.adults !== 1 ? 's' : ''}`)
  if (record.children_paid > 0) guestParts.push(`${record.children_paid} Child(ren) paid`)
  if (record.children_free > 0) guestParts.push(`${record.children_free} Child(ren) free`)
  if (record.drivers > 0) guestParts.push(`${record.drivers} Driver${record.drivers !== 1 ? 's' : ''}`)

  const notesText = record.customer_notes ?? record.package_snapshot.notes

  return (
    <div className="print-layout mx-auto max-w-[800px] bg-white p-8 font-sans text-gray-900 print:p-6 print:shadow-none">
      {/* ── HEADER ─────────────────────────────────────────── */}
      <div className="mb-6 flex items-start justify-between border-b-2 border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{resortName}</h1>
          {contactNums && (
            <p className="mt-1 text-xs text-gray-500">{contactNums}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{docType}</p>
          <p className="mt-0.5 text-xl font-bold text-gray-900">#{refNumber}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            Issued: {formatDate(record.created_at.slice(0, 10))}
          </p>
        </div>
      </div>

      {/* ── CUSTOMER ───────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
        <InfoRow label="Customer Name" value={record.customer_name} />
        <InfoRow label="Phone"         value={record.customer_phone} />
        <InfoRow label="Package"       value={record.package_snapshot.name} />
        <InfoRow
          label="Type"
          value={record.package_type === 'night' ? 'Overnight Stay' : 'Daylong'}
        />
        <InfoRow label="Date / Stay"   value={dateLine} />
        <InfoRow
          label="Check-in / Check-out"
          value={`${record.package_snapshot.check_in}  —  ${record.package_snapshot.check_out}`}
        />
        {guestParts.length > 0 && (
          <InfoRow label="Guests" value={guestParts.join(', ')} className="col-span-2" />
        )}
      </div>

      {/* ── ROOMS TABLE ────────────────────────────────────── */}
      {rooms.length > 0 && (
        <div className="mb-6">
          <SectionTitle>Rooms</SectionTitle>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-300 bg-gray-100 text-left">
                <Th>Room Type</Th>
                <Th className="text-center">Qty</Th>
                <Th className="text-right">Unit Price</Th>
                {record.package_type === 'night' && <Th className="text-center">Nights</Th>}
                <Th className="text-right">Subtotal</Th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => {
                const nights = record.nights ?? 1
                const subtotal =
                  record.package_type === 'night'
                    ? room.qty * room.unit_price * nights
                    : room.qty * room.unit_price
                return (
                  <tr key={room.id} className="border-b border-gray-100">
                    <Td>{ROOM_LABELS[room.room_type] ?? room.room_type}</Td>
                    <Td className="text-center">{room.qty}</Td>
                    <Td className="text-right font-mono">{formatBDT(room.unit_price)}</Td>
                    {record.package_type === 'night' && (
                      <Td className="text-center">{nights}</Td>
                    )}
                    <Td className="text-right font-mono">{formatBDT(subtotal)}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── PRICING BREAKDOWN ──────────────────────────────── */}
      <div className="mb-6">
        <SectionTitle>Pricing Breakdown</SectionTitle>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-300 bg-gray-100 text-left">
              <Th>Description</Th>
              <Th className="text-center">Qty</Th>
              {record.package_type === 'night' && <Th className="text-center">Nights</Th>}
              <Th className="text-right">Unit Price</Th>
              <Th className="text-right">Subtotal</Th>
            </tr>
          </thead>
          <tbody>
            {record.line_items.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-100">
                <Td>{item.label}</Td>
                <Td className="text-center">{item.qty}</Td>
                {record.package_type === 'night' && (
                  <Td className="text-center">{item.nights ?? '—'}</Td>
                )}
                <Td className="text-right font-mono">{formatBDT(item.unit_price)}</Td>
                <Td className="text-right font-mono">{formatBDT(item.subtotal)}</Td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals block */}
        <div className="mt-3 flex justify-end">
          <div className="w-64">
            <TotalRow label="Subtotal" value={formatBDT(record.subtotal)} />
            {record.discount > 0 && (
              <TotalRow label="Discount" value={`-${formatBDT(record.discount)}`} className="text-red-600" />
            )}
            <TotalRow label="Total" value={formatBDT(record.total)} bold />
            <div className="my-1 border-t border-gray-200" />
            <TotalRow label="Advance Required" value={formatBDT(record.advance_required)} />
            <TotalRow label="Advance Paid"     value={formatBDT(record.advance_paid)} />
            <TotalRow label="Remaining Due"    value={formatBDT(record.remaining)} bold />
          </div>
        </div>
      </div>

      {/* ── MEALS ──────────────────────────────────────────── */}
      {record.package_snapshot.meals && (
        <div className="mb-6">
          <SectionTitle>Meals Included</SectionTitle>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{record.package_snapshot.meals}</p>
        </div>
      )}

      {/* ── NOTES ──────────────────────────────────────────── */}
      {notesText && (
        <div className="mb-6">
          <SectionTitle>Notes</SectionTitle>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{notesText}</p>
        </div>
      )}

      {/* ── PAYMENT ────────────────────────────────────────── */}
      {paymentInfo && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <SectionTitle className="text-amber-800">Payment Information</SectionTitle>
          <p className="whitespace-pre-wrap text-sm text-amber-900">{paymentInfo}</p>
        </div>
      )}

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <div className="mt-8 border-t border-gray-200 pt-4 text-center text-xs text-gray-400">
        {footerText ? (
          <p>{footerText}</p>
        ) : (
          <p>Thank you for choosing {resortName}. We look forward to welcoming you.</p>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h2 className={`mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 ${className}`}>
      {children}
    </h2>
  )
}

function InfoRow({
  label,
  value,
  className = '',
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  )
}

function Th({
  children,
  className = '',
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <th className={`px-3 py-2 text-xs font-semibold text-gray-600 ${className}`}>{children}</th>
  )
}

function Td({
  children,
  className = '',
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <td className={`px-3 py-2 text-sm text-gray-800 ${className}`}>{children}</td>
  )
}

function TotalRow({
  label,
  value,
  bold = false,
  className = '',
}: {
  label: string
  value: string
  bold?: boolean
  className?: string
}) {
  return (
    <div className={`flex justify-between py-0.5 text-sm ${bold ? 'font-semibold text-gray-900' : 'text-gray-700'} ${className}`}>
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}
