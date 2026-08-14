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
