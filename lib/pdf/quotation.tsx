import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { formatBDT } from '@/lib/formatters/currency'

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica', color: '#111827', lineHeight: 1.5 },
  header: { borderBottomWidth: 2, borderBottomColor: '#14532d', paddingBottom: 8, marginBottom: 12 },
  brand: { fontSize: 18, fontWeight: 700, color: '#14532d' },
  subtitle: { fontSize: 11, color: '#4b5563', marginTop: 2 },
  draftBadge: { marginTop: 4, color: '#b45309', fontSize: 9, fontWeight: 700 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  metaLeft: { flexBasis: '55%' },
  metaRight: { flexBasis: '40%', textAlign: 'right', fontSize: 9, color: '#374151' },
  label: { fontSize: 8, textTransform: 'uppercase', color: '#6b7280', letterSpacing: 0.5 },
  value: { fontSize: 11 },

  sectionLabel: {
    fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
    color: '#14532d', marginTop: 10, marginBottom: 4, letterSpacing: 0.5,
  },
  block: { borderTopWidth: 0.5, borderTopColor: '#d1d5db', paddingTop: 6, paddingBottom: 4 },
  inline: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1 },
  inlineLabel: { fontSize: 10, color: '#1f2937', flex: 1 },
  inlineValue: { fontSize: 10, color: '#111827', fontFamily: 'Helvetica-Bold', textAlign: 'right' },

  totalsBlock: { borderTopWidth: 1, borderTopColor: '#14532d', marginTop: 8, paddingTop: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  grandTotalLabel: { fontSize: 12, fontWeight: 700, color: '#14532d' },
  grandTotalValue: { fontSize: 12, fontWeight: 700, color: '#14532d', fontFamily: 'Helvetica-Bold' },

  small: { fontSize: 9, color: '#374151', marginTop: 3 },
  notes: { backgroundColor: '#fef3c7', borderRadius: 4, padding: 8, marginTop: 6 },
  footer: {
    position: 'absolute', bottom: 24, left: 36, right: 36,
    borderTopWidth: 0.5, borderTopColor: '#e5e7eb', paddingTop: 4,
    fontSize: 8, color: '#9ca3af', textAlign: 'center',
  },
})

export interface QuotationPdfInput {
  /** 'Quotation' or 'Confirmed Booking' — drives the heading. */
  documentType: 'quotation' | 'booking'
  /** True for live draft preview; renders a "DRAFT PREVIEW" badge. */
  isDraftPreview?: boolean
  /** Display reference, e.g. quote_number or booking_number. */
  referenceNumber: string | null
  customerName:  string
  customerPhone: string
  packageName:   string
  visitDate:     string          // pre-formatted display string
  checkIn:       string
  checkOut:      string
  adults:        number
  childrenPaid:  number
  childrenFree:  number
  drivers:       number
  rooms: Array<{
    display_name: string
    qty:          number
    unit_price:   number
    nights:       number | null
    room_numbers?: string[] | null
  }>
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
  generatedAt: Date
}

function bdt(n: number): string { return formatBDT(Math.round(n)) }

export function QuotationPdfDocument(p: QuotationPdfInput) {
  const headingPrefix = p.documentType === 'booking' ? 'Booking' : 'Quotation'
  const heading = p.isDraftPreview ? `${headingPrefix} (Draft Preview)` : headingPrefix

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>🌿 {p.resortName ?? 'Garden Centre Resort'}</Text>
          <Text style={styles.subtitle}>{heading}{p.referenceNumber ? ` · ${p.referenceNumber}` : ''}</Text>
          {p.isDraftPreview && <Text style={styles.draftBadge}>DRAFT — not yet confirmed</Text>}
          {p.resortAddress && <Text style={styles.small}>{p.resortAddress}</Text>}
        </View>

        {/* Customer + package meta */}
        <View style={styles.metaRow}>
          <View style={styles.metaLeft}>
            <Text style={styles.label}>Package</Text>
            <Text style={styles.value}>{p.packageName}</Text>
            <Text style={[styles.label, { marginTop: 6 }]}>Guest</Text>
            <Text style={styles.value}>{p.customerName}</Text>
            <Text style={styles.small}>{p.customerPhone || '—'}</Text>
          </View>
          <View style={styles.metaRight}>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{p.visitDate}</Text>
            <Text style={styles.small}>Check-in: {p.checkIn}</Text>
            <Text style={styles.small}>Check-out: {p.checkOut}</Text>
          </View>
        </View>

        {/* Guests */}
        <Text style={styles.sectionLabel}>Guests</Text>
        <View style={styles.block}>
          <Text style={styles.small}>
            {p.adults > 0 ? `Adults: ${p.adults}   ` : ''}
            {p.childrenPaid > 0 ? `Children (4–9): ${p.childrenPaid}   ` : ''}
            {p.childrenFree > 0 ? `Children (<3, free): ${p.childrenFree}   ` : ''}
            {p.drivers > 0 ? `Drivers: ${p.drivers}` : ''}
            {(p.adults + p.childrenPaid + p.childrenFree + p.drivers === 0) ? 'No guests entered' : ''}
          </Text>
        </View>

        {/* Rooms */}
        <Text style={styles.sectionLabel}>Rooms</Text>
        <View style={styles.block}>
          {p.rooms.length === 0 ? (
            <Text style={styles.small}>No rooms selected</Text>
          ) : p.rooms.map((r, i) => {
            const isComp = r.unit_price === 0
            const nightFactor = r.nights ? ` × ${r.nights}n` : ''
            const subtotal = r.qty * r.unit_price * (r.nights ?? 1)
            const right = isComp
              ? 'Complimentary'
              : `${r.qty} × ${bdt(r.unit_price)}${nightFactor} = ${bdt(subtotal)}`
            return (
              <View key={i} style={styles.inline}>
                <Text style={styles.inlineLabel}>
                  {r.display_name} × {r.qty}
                  {r.room_numbers && r.room_numbers.length > 0 ? ` (${r.room_numbers.join(', ')})` : ''}
                </Text>
                <Text style={styles.inlineValue}>{right}</Text>
              </View>
            )
          })}
        </View>

        {/* Pricing breakdown */}
        <Text style={styles.sectionLabel}>Pricing breakdown</Text>
        <View style={styles.block}>
          {p.lineItems.length === 0 ? (
            <Text style={styles.small}>No line items</Text>
          ) : p.lineItems.map((li, i) => {
            const nightFactor = li.nights ? ` × ${li.nights}n` : ''
            const showFactors = li.qty > 1 || li.nights
            const right = showFactors
              ? `${li.qty} × ${bdt(li.unit_price)}${nightFactor} = ${bdt(li.subtotal)}`
              : bdt(li.subtotal)
            return (
              <View key={i} style={styles.inline}>
                <Text style={styles.inlineLabel}>{li.label}</Text>
                <Text style={styles.inlineValue}>{right}</Text>
              </View>
            )
          })}
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.inlineLabel}>Subtotal</Text>
            <Text style={styles.inlineValue}>{bdt(p.subtotal)}</Text>
          </View>
          {p.discount > 0 && (
            <View style={styles.totalRow}>
              <Text style={[styles.inlineLabel, { color: '#047857' }]}>
                Discount{p.discountPct && p.discountPct > 0 ? ` (${p.discountPct}%)` : ''}
              </Text>
              <Text style={[styles.inlineValue, { color: '#047857' }]}>− {bdt(p.discount)}</Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{bdt(p.total)}</Text>
          </View>
          {(p.advanceRequired > 0 || p.advancePaid > 0) && (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.inlineLabel}>Advance required</Text>
                <Text style={styles.inlineValue}>{bdt(p.advanceRequired)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.inlineLabel}>Advance paid</Text>
                <Text style={styles.inlineValue}>{bdt(p.advancePaid)}</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.grandTotalLabel}>Remaining</Text>
                <Text style={styles.grandTotalValue}>{bdt(p.remaining)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Meals */}
        {p.meals && (
          <>
            <Text style={styles.sectionLabel}>Meals</Text>
            <Text style={styles.small}>{p.meals}</Text>
          </>
        )}

        {/* Notes */}
        {p.notes && (
          <View style={styles.notes}>
            <Text style={[styles.label, { color: '#92400e' }]}>Notes</Text>
            <Text style={[styles.small, { color: '#7c2d12' }]}>{p.notes}</Text>
          </View>
        )}

        {/* Payment instructions */}
        {p.paymentInstructions && (
          <>
            <Text style={styles.sectionLabel}>Payment</Text>
            <Text style={styles.small}>{p.paymentInstructions}</Text>
          </>
        )}

        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) =>
          `${p.resortPhone ? p.resortPhone + ' · ' : ''}Generated ${p.generatedAt.toLocaleString('en-GB')} · Page ${pageNumber}/${totalPages}`
        } />
      </Page>
    </Document>
  )
}
