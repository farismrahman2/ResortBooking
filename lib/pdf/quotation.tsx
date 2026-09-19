import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'
import { formatTime12h } from '@/lib/formatters/dates'

/**
 * The quotation / booking-confirmation PDF.
 *
 * Two rules this document has to respect:
 *
 *  1. Money is written "BDT 1,62,800", never with the ৳ sign. @react-pdf's
 *     built-in Helvetica has no glyph for U+09F3 and silently substitutes a
 *     wrong one — every amount came out as "ó5,000". Same for emoji.
 *  2. A room row priced at 0 is complimentary. It still gets a line (the guest
 *     needs to know which rooms are theirs) but never a rate or an amount.
 *  3. No room numbers. Which physical room a guest gets is decided at the desk
 *     and printed nowhere on a guest document; only how many rooms of each
 *     type, and whether any of them come in the evening.
 *
 * The layout deliberately matches lib/pdf/invoice.tsx so the three documents a
 * guest receives look like one set.
 */

const BRAND = '#14532d'

const styles = StyleSheet.create({
  page: {
    paddingTop: 36, paddingBottom: 40, paddingHorizontal: 40,
    fontSize: 10, fontFamily: 'Helvetica', color: '#111827',
  },
  /** No `lineHeight` on the Page: @react-pdf 4.5 drops dynamic `render`
   *  nodes — the page-number footer — when the Page style carries one. */
  header:     { borderBottom: `1pt solid ${BRAND}`, paddingBottom: 8, marginBottom: 12 },
  headerRow:  { flexDirection: 'row', alignItems: 'center' },
  brand:      { fontSize: 16, fontWeight: 'bold', color: BRAND },
  brandSub:   { fontSize: 8, color: '#6b7280', marginTop: 2 },

  titleBar:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  title:      { fontSize: 18, fontWeight: 'bold', letterSpacing: 1 },
  titleMeta:  { fontSize: 9, textAlign: 'right', color: '#374151' },
  draft: {
    marginTop: 4, alignSelf: 'flex-start', backgroundColor: '#fef3c7', color: '#92400e',
    fontSize: 8, fontWeight: 'bold', letterSpacing: 0.5,
    paddingVertical: 2, paddingHorizontal: 6, borderRadius: 3,
  },

  twoColumns: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  block:      { flexBasis: '48%' },
  blockLabel: { fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280', marginBottom: 2 },
  blockBody:  { fontSize: 10, lineHeight: 1.35 },
  blockStrong:{ fontSize: 10, fontWeight: 'bold', lineHeight: 1.35 },

  sectionLabel: {
    fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5,
    color: BRAND, fontWeight: 'bold', marginTop: 9, marginBottom: 3,
  },
  table:       { borderTop: '0.5pt solid #d1d5db', borderBottom: '0.5pt solid #d1d5db' },
  tableHeader: {
    flexDirection: 'row', backgroundColor: '#f3f4f6',
    paddingVertical: 5, paddingHorizontal: 4,
    fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5,
    color: '#374151', fontWeight: 'bold',
  },
  tableRow:    { flexDirection: 'row', borderTop: '0.5pt solid #e5e7eb', paddingVertical: 4, paddingHorizontal: 4 },
  colDesc:     { flexGrow: 1, flexShrink: 1, flexBasis: 0, paddingRight: 6 },
  colQty:      { width: 28, textAlign: 'right' },
  colNights:   { width: 38, textAlign: 'right' },
  colRate:     { width: 62, textAlign: 'right' },
  colAmt:      { width: 74, textAlign: 'right' },
  comp:        { fontSize: 9, color: '#047857' },
  tableNote:   { fontSize: 8, color: '#6b7280', marginTop: 4, lineHeight: 1.3 },

  totals:      { marginTop: 10, alignSelf: 'flex-end', width: '58%' },
  totalRow:    { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalLabel:  { color: '#374151' },
  divider:     { borderTop: '0.5pt solid #d1d5db', marginVertical: 4 },
  bigRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, paddingHorizontal: 6,
    backgroundColor: BRAND, color: 'white', borderRadius: 3,
    fontSize: 12, fontWeight: 'bold', marginTop: 4,
  },
  dueRow:      { backgroundColor: '#b45309' },

  infoBody:    { fontSize: 9, color: '#374151' },
  panel:       { marginTop: 12, border: '0.5pt solid #e5e7eb', borderRadius: 3, backgroundColor: '#f9fafb' },
  panelRow:    { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8 },
  panelDivide: { borderTop: '0.5pt solid #e5e7eb' },
  panelLabel:  { width: 86, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b7280' },
  panelBody:   { flexGrow: 1, flexShrink: 1, flexBasis: 0, fontSize: 9, color: '#374151', lineHeight: 1.35 },
  footer: {
    position: 'absolute', bottom: 28, left: 40, right: 40,
    borderTop: '0.5pt solid #e5e7eb', paddingTop: 6,
    fontSize: 8, color: '#6b7280', textAlign: 'center',
  },
})

export interface QuotationPdfInput {
  /** 'Quotation' or 'Booking Confirmation' — drives the heading. */
  documentType: 'quotation' | 'booking'
  /** True while the quote is still a draft; renders a "DRAFT" chip. */
  isDraftPreview?: boolean
  /** Display reference, e.g. quote_number or booking_number. */
  referenceNumber: string | null
  customerName:  string
  customerPhone: string
  /** Set for corporate bookings — printed above the guest name. */
  companyName?:  string | null
  packageName:   string
  visitDate:     string          // pre-formatted display string
  /** When the quote/booking was raised, pre-formatted. */
  issuedDate?:   string
  checkIn:       string
  checkOut:      string
  adults:        number
  childrenPaid:  number
  childrenFree:  number
  drivers:       number
  rooms: Array<{
    display_name: string
    qty:          number
    /** 0 means complimentary — no rate, no amount. */
    unit_price:   number
    nights:       number | null
    room_numbers?: string[] | null
    /** Handed over at the evening handover time on the check-in day. */
    evening_rooms?: string[] | null
  }>
  /** "7:00 PM" — when evening-handover rooms are given to the guests. */
  handoverLabel?: string
  lineItems: Array<{
    label:      string
    qty:        number
    unit_price: number
    nights:     number | null
    subtotal:   number
  }>
  subtotal:        number
  discount:        number
  discountPct?:    number
  total:           number
  advanceRequired: number
  advancePaid:     number
  remaining:       number
  meals?:    string | null
  notes?:    string | null
  paymentInstructions?: string | null
  resortPhone?: string
  resortAddress?: string
  resortName?: string
  /** Optional logo PNG/JPEG buffer — rendered left of the brand line. */
  logo?: Buffer | string | null
  generatedAt: Date
}

/** 162800 → "1,62,800". No ৳: Helvetica has no glyph for it. */
function money(n: number): string {
  return Math.round(n).toLocaleString('en-IN')
}
function bdt(n: number): string {
  return `BDT ${money(n)}`
}

export function QuotationPdfDocument(p: QuotationPdfInput) {
  const title = p.documentType === 'booking' ? 'BOOKING CONFIRMATION' : 'QUOTATION'

  const paidRooms = p.rooms.filter((r) => r.unit_price > 0)
  const compRooms = p.rooms.filter((r) => r.unit_price === 0)
  const showNights = p.rooms.some((r) => (r.nights ?? 0) > 1)

  // Evening-handover rooms are named by count on the room-type line, with one
  // footnote — never by number.
  const eveningCount = (r: QuotationPdfInput['rooms'][number]) =>
    (r.evening_rooms ?? []).filter((n) => (r.room_numbers ?? []).includes(n)).length
  const anyEvening = p.rooms.some((r) => eveningCount(r) > 0)
  const handover   = p.handoverLabel ?? '7:00 PM'

  const guestParts = [
    p.adults > 0       ? `${p.adults} adult${p.adults === 1 ? '' : 's'}` : null,
    p.childrenPaid > 0 ? `${p.childrenPaid} child${p.childrenPaid === 1 ? '' : 'ren'}` : null,
    p.childrenFree > 0 ? `${p.childrenFree} infant${p.childrenFree === 1 ? '' : 's'} (free)` : null,
    p.drivers > 0      ? `${p.drivers} driver${p.drivers === 1 ? '' : 's'}` : null,
  ].filter(Boolean)

  return (
    <Document
      title={`${title} ${p.referenceNumber ?? ''}`.trim()}
      author={p.resortName ?? 'Garden Centre Resort'}
    >
      <Page size="A4" style={styles.page} wrap>
        {/* ── Brand ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            {p.logo && (
              <Image src={p.logo as any} style={{ width: 52, height: 52, marginRight: 12, objectFit: 'contain' }} />  // eslint-disable-line @typescript-eslint/no-explicit-any
            )}
            <View style={{ flexGrow: 1, flexShrink: 1 }}>
              <Text style={styles.brand}>{p.resortName ?? 'Garden Centre Resort'}</Text>
              {p.resortAddress && <Text style={styles.brandSub}>{p.resortAddress}</Text>}
              {p.resortPhone && <Text style={styles.brandSub}>{p.resortPhone}</Text>}
            </View>
          </View>
        </View>

        {/* ── Document title + reference ────────────────────── */}
        <View style={styles.titleBar}>
          <View>
            <Text style={styles.title}>{title}</Text>
            {p.isDraftPreview && <Text style={styles.draft}>DRAFT — NOT YET CONFIRMED</Text>}
          </View>
          <View style={styles.titleMeta}>
            {p.referenceNumber && <Text>No. {p.referenceNumber}</Text>}
            {p.issuedDate && <Text>Issued {p.issuedDate}</Text>}
          </View>
        </View>

        {/* ── Guest + stay ──────────────────────────────────── */}
        <View style={styles.twoColumns}>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>{p.documentType === 'booking' ? 'Guest' : 'Prepared for'}</Text>
            {p.companyName && <Text style={styles.blockStrong}>{p.companyName}</Text>}
            <Text style={p.companyName ? styles.blockBody : styles.blockStrong}>{p.customerName}</Text>
            <Text style={styles.blockBody}>{p.customerPhone || '—'}</Text>
          </View>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Stay</Text>
            <Text style={styles.blockStrong}>{p.visitDate}</Text>
            <Text style={styles.blockBody}>
              Check-in {formatTime12h(p.checkIn)} · Check-out {formatTime12h(p.checkOut)}
            </Text>
            <Text style={styles.blockBody}>{p.packageName}</Text>
            {guestParts.length > 0 && <Text style={styles.blockBody}>{guestParts.join(', ')}</Text>}
          </View>
        </View>

        {/* ── Rooms ─────────────────────────────────────────── */}
        {p.rooms.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Rooms</Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={styles.colDesc}>Room type</Text>
                <Text style={styles.colQty}>Qty</Text>
                {showNights && <Text style={styles.colNights}>Nights</Text>}
                <Text style={styles.colRate}>Rate</Text>
                <Text style={styles.colAmt}>Amount</Text>
              </View>
              {[...paidRooms, ...compRooms].map((r, i) => {
                const isComp = r.unit_price === 0
                const nights = r.nights ?? 1
                const evening = eveningCount(r)
                const eveningNote = evening === 0 ? ''
                  : evening >= r.qty ? ` — from ${handover}`
                  : ` — ${evening} of ${r.qty} from ${handover}`
                return (
                  <View key={i} style={styles.tableRow}>
                    <Text style={styles.colDesc}>
                      {r.display_name}
                      {eveningNote && <Text style={{ color: '#6b7280', fontSize: 8 }}>{eveningNote}</Text>}
                    </Text>
                    <Text style={styles.colQty}>{r.qty}</Text>
                    {showNights && <Text style={styles.colNights}>{isComp ? '—' : nights}</Text>}
                    <Text style={styles.colRate}>{isComp ? '—' : money(r.unit_price)}</Text>
                    {isComp
                      ? <Text style={[styles.colAmt, styles.comp]}>Complimentary</Text>
                      : <Text style={styles.colAmt}>{money(r.qty * r.unit_price * nights)}</Text>}
                  </View>
                )
              })}
            </View>
            {anyEvening && (
              <Text style={styles.tableNote}>
                Rooms marked &quot;from {handover}&quot; are handed over once that day&apos;s guests
                leave. All other rooms are ready on arrival.
              </Text>
            )}
          </>
        )}

        {/* ── Charges ───────────────────────────────────────── */}
        <Text style={styles.sectionLabel}>Charges</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colRate}>Rate</Text>
            <Text style={styles.colAmt}>Amount</Text>
          </View>
          {p.lineItems.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={styles.colDesc}>No charges recorded</Text>
            </View>
          ) : p.lineItems.map((li, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={styles.colDesc}>
                {li.label.trim()}{li.nights ? ` · ${li.nights} night${li.nights === 1 ? '' : 's'}` : ''}
              </Text>
              <Text style={styles.colQty}>{li.qty}</Text>
              <Text style={styles.colRate}>{money(li.unit_price)}</Text>
              <Text style={styles.colAmt}>{money(li.subtotal)}</Text>
            </View>
          ))}
        </View>

        {/* ── Totals ────────────────────────────────────────── */}
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text>{bdt(p.subtotal)}</Text>
          </View>
          {p.discount > 0 && (
            <View style={styles.totalRow}>
              <Text style={[styles.totalLabel, { color: '#047857' }]}>
                Discount{p.discountPct && p.discountPct > 0 ? ` (${p.discountPct}%)` : ''}
              </Text>
              <Text style={{ color: '#047857' }}>- {bdt(p.discount)}</Text>
            </View>
          )}
          <View style={styles.bigRow}>
            <Text>Total</Text>
            <Text>{bdt(p.total)}</Text>
          </View>

          {(p.advanceRequired > 0 || p.advancePaid > 0) && (
            <>
              <View style={styles.divider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Advance required</Text>
                <Text>{bdt(p.advanceRequired)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Advance paid</Text>
                <Text>{bdt(p.advancePaid)}</Text>
              </View>
              <View style={[styles.bigRow, styles.dueRow]}>
                <Text>Balance due</Text>
                <Text>{bdt(p.remaining)}</Text>
              </View>
            </>
          )}
        </View>

        {/* ── Inclusions and terms ──────────────────────────── */}
        {(p.meals || p.notes || p.paymentInstructions) && (
          <View style={styles.panel}>
            {[
              p.meals              ? { label: 'Meals included', body: p.meals.trim() } : null,
              p.notes              ? { label: 'Notes',          body: p.notes.trim() } : null,
              p.paymentInstructions? { label: 'Payment',        body: p.paymentInstructions.trim() } : null,
            ].filter(Boolean).map((row, i) => (
              <View key={i} style={i === 0 ? styles.panelRow : [styles.panelRow, styles.panelDivide]}>
                <Text style={styles.panelLabel}>{row!.label}</Text>
                <Text style={styles.panelBody}>{row!.body}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) =>
          `${p.resortName ?? 'Garden Centre Resort'}${p.resortPhone ? ` · ${p.resortPhone}` : ''}` +
          ` · Generated ${p.generatedAt.toLocaleString('en-GB')} · Page ${pageNumber} of ${totalPages}`
        } />
      </Page>
    </Document>
  )
}
