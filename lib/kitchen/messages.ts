import type { KitchenRequisition, VendorSection, VendorLine } from '@/lib/supabase/types-kitchen'

/**
 * WhatsApp message builders for the supplier groups.
 *
 * These reproduce the format the suppliers ALREADY receive every night. The
 * beef group and the chicken group use visibly different layouts, and the
 * people reading them do so at a glance — normalising both into one house
 * style would make our output look wrong to the recipients. So the layout is
 * per vendor, overridable from kitchen_vendors.order_template / bill_template.
 */

/** "13 August 2026" — the long form the groups use. */
function longDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Trims a trailing ".000" so 24.000 kg reads as 24 kg. */
export function num(n: number | null | undefined): string {
  if (n === null || n === undefined) return ''
  const s = Number(n).toFixed(3).replace(/\.?0+$/, '')
  return s === '' ? '0' : s
}

/** Thousands separators, matching "16,800/-". */
export function money(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/**
 * One ordered line as the vendor reads it.
 *   "Cow meat : 24 kg"
 *   "Chicken sonali : 31 kg (40 pcs)"   ← piece_count present
 */
function orderLine(l: VendorLine): string {
  const unit  = l.unit_label ? ` ${l.unit_label}` : ''
  const pcs   = l.piece_count ? ` (${num(l.piece_count)} pcs)` : ''
  const extra = l.is_extra ? '  ⟵ extra' : ''
  const note  = l.notes ? `  — ${l.notes}` : ''
  return `${l.item_name} : ${num(l.qty)}${unit}${pcs}${extra}${note}`
}

/**
 * The ORDER message — sent after approval, before delivery.
 * No prices: at order time the rate isn't struck yet.
 */
export function buildOrderMessage(
  req: Pick<KitchenRequisition, 'requisition_no' | 'event_date' | 'is_emergency'>,
  section: VendorSection,
): string {
  const head = [
    `Event date : ${longDate(req.event_date)}`,
    `Requisition : ${req.requisition_no}`,
    req.is_emergency ? 'EMERGENCY ORDER' : null,
  ].filter(Boolean).join('\n')

  // The groups already post "No order" on a day with nothing to supply —
  // silence would be ambiguous with a message that failed to send.
  if (section.lines.length === 0) {
    return `${head}\n────────────\nNo order`
  }

  return [head, '────────────', ...section.lines.map(orderLine)].join('\n')
}

/**
 * The BILL message — sent after the goods arrive and the supplier's receipt
 * number and rates are recorded. Phase 2 fills `priced`; the shape lives here
 * so both halves of the conversation stay in one file.
 */
export interface PricedLine {
  item_name:   string
  qty:         number
  piece_count: number | null
  unit_label:  string | null
  rate:        number
  amount:      number
}

/**
 * Mirrors the chicken group's line shape, which is the more detailed of the
 * two and degrades cleanly to the beef group's when there's no piece count:
 *   "Chicken sonali (40 pcs( 31x335) = 10,385"
 *   "Cow meat : 24 kg @ 700 = 16,800/-"
 */
function billLine(l: PricedLine): string {
  const unit = l.unit_label ? ` ${l.unit_label}` : ''
  if (l.piece_count) {
    return `${l.item_name} (${num(l.piece_count)} pcs( ${num(l.qty)}x${num(l.rate)}) = ${money(l.amount)}`
  }
  return `${l.item_name} : ${num(l.qty)}${unit} @ ${num(l.rate)} = ${money(l.amount)}/-`
}

export function buildBillMessage(input: {
  receiptNo:      string
  supplyDate:     string
  eventDate:      string
  requisitionNo:  string
  isEmergency?:   boolean
  lines:          PricedLine[]
}): string {
  const total = input.lines.reduce((s, l) => s + l.amount, 0)
  return [
    `Receipt : ${input.receiptNo}`,
    `Supply date : ${longDate(input.supplyDate)}`,
    '────────────',
    `Event date : ${longDate(input.eventDate)}`,
    `Requisition : ${input.requisitionNo}`,
    input.isEmergency ? 'EMERGENCY ORDER' : null,
    '',
    ...input.lines.map(billLine),
    '────────────',
    `Total due : ${money(total)}/-`,
  ].filter((x) => x !== null).join('\n')
}

/**
 * Applies a vendor's own template if it has one. Placeholders are deliberately
 * simple so a manager can edit the template without breaking it:
 *   {{event_date}} {{requisition_no}} {{lines}} {{receipt_no}}
 *   {{supply_date}} {{total}}
 */
export function applyTemplate(
  template: string | null,
  vars: Record<string, string>,
  fallback: string,
): string {
  if (!template?.trim()) return fallback
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '')
}
