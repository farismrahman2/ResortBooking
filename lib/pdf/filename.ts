/**
 * PDF file names carry the time the record was last changed (Dhaka), e.g.
 * GCR-booking-GCR-B-2026-1304-v19Oct-1702.pdf — so a phone that already
 * saved the earlier version can't open that one in place of the new one.
 */
export function versionedPdfName(prefix: string, ref: string, updatedAt?: string | null): string {
  if (!updatedAt) return `${prefix}-${ref}.pdf`
  const d = new Date(updatedAt)
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(d).reduce<Record<string, string>>((m, p) => ((m[p.type] = p.value), m), {})
  return `${prefix}-${ref}-v${parts.day}${parts.month}-${parts.hour}${parts.minute}.pdf`
}
