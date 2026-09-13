import { describe, expect, it } from 'vitest'
import { QuotationPdfDocument, type QuotationPdfInput } from './quotation'

/**
 * These guard the three things that were wrong with the downloaded PDF:
 * complimentary rooms priced as if paid, glyphs Helvetica cannot draw, and a
 * page-number footer that silently disappeared.
 */

const INPUT: QuotationPdfInput = {
  documentType: 'quotation',
  isDraftPreview: true,
  referenceNumber: 'GCR-2026-1317',
  customerName: 'Shofiqul Islam',
  customerPhone: '01677170406',
  packageName: 'Daylong Package',
  visitDate: 'Thursday, 17 Sept 2026',
  issuedDate: 'Sunday, 13 Sept 2026',
  checkIn: '09:00:00',
  checkOut: '18:00:00',
  adults: 80, childrenPaid: 0, childrenFree: 0, drivers: 0,
  rooms: [
    { display_name: 'Cottage',    qty: 3, unit_price: 5000, nights: null, room_numbers: ['103', '104', '107'], evening_rooms: [] },
    { display_name: 'Eco Deluxe', qty: 2, unit_price: 0,    nights: null, room_numbers: ['207', '204'],        evening_rooms: [] },
    { display_name: 'Deluxe',     qty: 2, unit_price: 7000, nights: 1,    room_numbers: ['301', '302'],        evening_rooms: ['302'] },
  ],
  handoverLabel: '7:00 PM',
  lineItems: [
    { label: 'Cottage × 3', qty: 3, unit_price: 5000, nights: null, subtotal: 15000 },
    { label: 'Adults (Weekday rate)', qty: 80, unit_price: 1950, nights: null, subtotal: 156000 },
  ],
  subtotal: 197000, discount: 34200, discountPct: 0, total: 162800,
  advanceRequired: 81400, advancePaid: 0, remaining: 162800,
  meals: 'Breakfast, Lunch, Snacks',
  paymentInstructions: '50% advance via bKash.',
  resortName: 'Garden Centre Resort',
  resortPhone: '+8801332511460',
  generatedAt: new Date('2026-09-13T06:00:00Z'),
}

/** Every string the document draws, including the dynamic footer. */
function drawnText(node: unknown): string[] {
  if (node == null || typeof node === 'boolean') return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(drawnText)
  const el = node as { props?: Record<string, unknown> }
  if (!el.props) return []
  const out: string[] = []
  const render = el.props.render
  if (typeof render === 'function') {
    out.push(String((render as (o: unknown) => unknown)({ pageNumber: 1, totalPages: 2 })))
  }
  out.push(...drawnText(el.props.children))
  return out
}

/** Each drawn string on its own, and the document as one flat line. */
const parts = () => drawnText(QuotationPdfDocument(INPUT))
const flat  = () => parts().join(' ').replace(/\s+/g, ' ')

describe('the quotation PDF', () => {
  it('prices only the rooms the guest is paying for', () => {
    expect(parts()).toContain('Complimentary')
    // The free Eco Deluxe must not pick up the package's list price.
    expect(parts()).not.toContain('6,000')
    expect(parts()).toContain('15,000')   // 3 cottages at 5,000
  })

  it('draws no glyph Helvetica lacks', () => {
    // ৳ and emoji rendered as "ó" and "<?" in the built-in font.
    expect(flat()).not.toMatch(/[৳\u{1F300}-\u{1FAFF}←-⇿]/u)
    expect(parts()).toContain('BDT 1,62,800')
  })

  it('marks evening-handover rooms and explains the marker once', () => {
    expect(parts()).toContain('301, 302*')
    expect(flat()).toMatch(/handed over from 7:00 PM/)
  })

  it('keeps the page-number footer', () => {
    // @react-pdf 4.5 drops dynamic `render` nodes when the Page style sets a
    // lineHeight — which silently removed this line.
    expect(flat()).toContain('Page 1 of 2')
  })
})
