/**
 * Requisition reference: RQ-0008.
 *
 * Your paper form and the supplier groups both use a short running number
 * ("Requsition(08)", "Requisition : RQ 08"), so this stays short rather than
 * date-stamped like the inventory movement numbers.
 *
 * Race-safe via retry-on-UNIQUE in the action, matching the pattern used by
 * account codes, visit refs and movement numbers.
 */
export function formatRequisitionNo(sequenceFromZero: number): string {
  return `RQ-${String(sequenceFromZero + 1).padStart(4, '0')}`
}

/** Short form for the supplier message: "RQ 08". */
export function shortRequisitionNo(ref: string): string {
  const n = ref.replace(/^RQ-?/i, '').replace(/^0+/, '')
  return `RQ ${n.padStart(2, '0')}`
}

/**
 * Amendment reference: RQ-0008-A, RQ-0008-B, …
 *
 * Deliberately a suffix on the parent rather than a fresh number in the main
 * series. Everyone involved — the approver, the storekeeper, the supplier
 * reading the WhatsApp message — needs to see at a glance that this belongs to
 * an order they already have. `RQ-0031` for a change to `RQ-0008` reads as a
 * brand new order, and gets delivered as one.
 */
export function formatAmendmentNo(parentRef: string, seqFromOne: number): string {
  // 26 amendments to one requisition is not a real scenario; if it happens,
  // carry on with AA, AB rather than colliding or throwing.
  const n = Math.max(1, seqFromOne) - 1
  const letter = n < 26
    ? String.fromCharCode(65 + n)
    : String.fromCharCode(65 + Math.floor(n / 26) - 1) + String.fromCharCode(65 + (n % 26))
  return `${parentRef}-${letter}`
}

/** Delivery reference: DL-0042. */
export function formatDeliveryNo(sequenceFromZero: number): string {
  return `DL-${String(sequenceFromZero + 1).padStart(4, '0')}`
}

/** Payment reference: PY-0042. */
export function formatPaymentNo(sequenceFromZero: number): string {
  return `PY-${String(sequenceFromZero + 1).padStart(4, '0')}`
}
