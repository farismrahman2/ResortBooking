import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { CheckoutWithFull } from '@/lib/supabase/types'

const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
    color: '#111827',
    lineHeight: 1.4,
  },
  header: {
    borderBottom: '1pt solid #14532d',
    paddingBottom: 10,
    marginBottom: 16,
  },
  brand: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#14532d',
  },
  brandSub: {
    fontSize: 8,
    color: '#6b7280',
    marginTop: 2,
  },
  invoiceBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  invoiceTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  invoiceMeta: {
    fontSize: 9,
    textAlign: 'right',
    color: '#374151',
  },
  twoColumns: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  block: {
    flexBasis: '48%',
  },
  blockLabel: {
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#6b7280',
    marginBottom: 2,
  },
  blockBody: {
    fontSize: 10,
    color: '#111827',
  },
  table: {
    marginTop: 4,
    borderTop: '0.5pt solid #d1d5db',
    borderBottom: '0.5pt solid #d1d5db',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    paddingVertical: 5,
    paddingHorizontal: 4,
    fontSize: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#374151',
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderTop: '0.5pt solid #e5e7eb',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  cell: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  cellRight: { flexGrow: 1, flexShrink: 1, flexBasis: 0, textAlign: 'right' },
  colDate: { width: 60 },
  colCat:  { width: 56 },
  colDesc: { flexGrow: 1, flexShrink: 1, flexBasis: 0 },
  colQty:  { width: 36, textAlign: 'right' },
  colPrice:{ width: 60, textAlign: 'right' },
  colAmt:  { width: 60, textAlign: 'right', fontWeight: 'bold' },
  totalsBlock: {
    marginTop: 12,
    alignSelf: 'flex-end',
    width: '52%',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    fontSize: 10,
  },
  totalLabel: {
    color: '#374151',
  },
  totalValue: {
    color: '#111827',
  },
  totalDivider: {
    borderTop: '0.5pt solid #d1d5db',
    marginVertical: 4,
  },
  bigTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: '#5b21b6',
    color: 'white',
    borderRadius: 3,
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  refundRow: {
    backgroundColor: '#0f766e',
  },
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 40,
    right: 40,
    borderTop: '0.5pt solid #e5e7eb',
    paddingTop: 6,
    fontSize: 8,
    color: '#6b7280',
    textAlign: 'center',
  },
  signLine: {
    marginTop: 30,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#6b7280',
  },
})

interface InvoiceProps {
  checkout: CheckoutWithFull
  resortName:    string
  resortAddress: string
  resortPhone:   string
  resortEmail?:  string
  issuedBy:      string | null
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash:           'Cash',
  bkash:          'bKash',
  nagad:          'Nagad',
  rocket:         'Rocket',
  card:           'Card',
  bank_transfer:  'Bank',
  other:          'Other',
}

function bdt(n: number): string {
  return `BDT ${Math.round(n).toLocaleString('en-IN')}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food', beverage: 'Beverage', damage: 'Damage', service: 'Service', misc: 'Misc',
}

export function Invoice({
  checkout, resortName, resortAddress, resortPhone, resortEmail, issuedBy,
}: InvoiceProps) {
  const invoiceNo = checkout.id.slice(0, 8).toUpperCase()
  const issuedOn  = fmtDate(checkout.finalized_at ?? checkout.updated_at)
  const booking   = checkout.booking
  const checkInOut = booking.check_out_date
    ? `${fmtDate(booking.visit_date)} → ${fmtDate(booking.check_out_date)}  (${booking.nights ?? 0} night${booking.nights === 1 ? '' : 's'})`
    : `${fmtDate(booking.visit_date)} (Daylong)`

  const advance     = Number(checkout.advance_amount)
  const charges     = Number(checkout.charges_total)
  const payments    = Number(checkout.payments_total)
  const subtotalDue = charges - advance
  const balance     = charges - advance - payments
  const isRefund    = balance < 0

  // Payments grouped by method
  const paymentsByMethod = new Map<string, number>()
  for (const p of checkout.payments) {
    paymentsByMethod.set(p.method, (paymentsByMethod.get(p.method) ?? 0) + Number(p.amount))
  }

  return (
    <Document title={`GCR Invoice ${invoiceNo}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>{resortName}</Text>
          <Text style={styles.brandSub}>
            {resortAddress}{'  ·  '}{resortPhone}
            {resortEmail ? `  ·  ${resortEmail}` : ''}
          </Text>
        </View>

        {/* Invoice meta */}
        <View style={styles.invoiceBar}>
          <Text style={styles.invoiceTitle}>INVOICE</Text>
          <View style={styles.invoiceMeta}>
            <Text>Invoice #{invoiceNo}</Text>
            <Text>Date: {issuedOn}</Text>
          </View>
        </View>

        {/* Bill to + Stay details */}
        <View style={styles.twoColumns}>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Bill To</Text>
            <Text style={[styles.blockBody, { fontWeight: 'bold' }]}>{booking.customer_name}</Text>
            <Text style={styles.blockBody}>{booking.customer_phone}</Text>
            <Text style={styles.blockBody}>Booking: {booking.booking_number}</Text>
          </View>
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Stay</Text>
            <Text style={styles.blockBody}>{checkInOut}</Text>
            <Text style={styles.blockBody}>
              {booking.adults} adult{booking.adults === 1 ? '' : 's'}
              {booking.children_paid + booking.children_free > 0
                ? `, ${booking.children_paid + booking.children_free} children`
                : ''}
              {booking.drivers > 0 ? `, ${booking.drivers} driver${booking.drivers === 1 ? '' : 's'}` : ''}
            </Text>
          </View>
        </View>

        {/* Charges table */}
        <Text style={[styles.blockLabel, { marginTop: 6 }]}>Charges</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDate}>Date</Text>
            <Text style={styles.colCat}>Category</Text>
            <Text style={styles.colDesc}>Description</Text>
            <Text style={styles.colQty}>Qty</Text>
            <Text style={styles.colPrice}>Unit</Text>
            <Text style={styles.colAmt}>Amount</Text>
          </View>
          {checkout.charges.length === 0 && (
            <View style={styles.tableRow}>
              <Text style={[styles.cell, { textAlign: 'center', color: '#9ca3af' }]}>
                No charges added.
              </Text>
            </View>
          )}
          {checkout.charges.map((c) => (
            <View key={c.id} style={styles.tableRow}>
              <Text style={styles.colDate}>{fmtDate(c.added_at)}</Text>
              <Text style={styles.colCat}>{CATEGORY_LABELS[c.category.slug] ?? c.category.display_name}</Text>
              <Text style={styles.colDesc}>{c.description}</Text>
              <Text style={styles.colQty}>{Number(c.quantity)}</Text>
              <Text style={styles.colPrice}>{bdt(Number(c.unit_price))}</Text>
              <Text style={styles.colAmt}>{bdt(Number(c.amount))}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Charges</Text>
            <Text style={styles.totalValue}>{bdt(charges)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Advance Paid (booking)</Text>
            <Text style={styles.totalValue}>− {bdt(advance)}</Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalRow}>
            <Text style={[styles.totalLabel, { fontWeight: 'bold' }]}>Subtotal Due</Text>
            <Text style={[styles.totalValue, { fontWeight: 'bold' }]}>{bdt(subtotalDue)}</Text>
          </View>
          {checkout.payments.length > 0 && (
            <>
              <View style={styles.totalDivider} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Payments at Checkout</Text>
                <Text style={styles.totalValue}>− {bdt(payments)}</Text>
              </View>
              {Array.from(paymentsByMethod.entries()).map(([method, amt]) => (
                <View key={method} style={[styles.totalRow, { fontSize: 9, color: '#6b7280' }]}>
                  <Text>  · {PAYMENT_METHOD_LABELS[method] ?? method}</Text>
                  <Text>{bdt(amt)}</Text>
                </View>
              ))}
            </>
          )}
          <View style={[styles.bigTotalRow, isRefund ? styles.refundRow : {}]}>
            <Text>{isRefund ? 'Refund Due' : 'Balance'}</Text>
            <Text>{bdt(Math.abs(balance))}</Text>
          </View>
        </View>

        {/* Sign */}
        <View style={styles.signLine}>
          <View>
            <Text>______________________</Text>
            <Text>Guest signature</Text>
          </View>
          <View>
            <Text>______________________</Text>
            <Text>For {resortName}</Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer} fixed>
          Thank you for staying with us.
          {issuedBy ? `  ·  Issued by ${issuedBy}` : ''}
          {'  ·  '}{issuedOn}
        </Text>
      </Page>
    </Document>
  )
}
