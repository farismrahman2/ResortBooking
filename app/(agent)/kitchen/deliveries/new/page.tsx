import { redirect } from 'next/navigation'
import { randomUUID } from 'crypto'
import { requirePermission } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

/**
 * Mints an id and opens a blank delivery. Writes NOTHING — the row appears on
 * the first real entry, so opening the screen to look at it leaves nothing
 * behind. `?requisition=` and `?vendor=` carry through to pre-fill the lines.
 */
export default async function NewDeliveryPage({
  searchParams,
}: {
  searchParams: { requisition?: string; vendor?: string }
}) {
  await requirePermission('kitchen', 'write')
  const qs = new URLSearchParams()
  if (searchParams.requisition) qs.set('requisition', searchParams.requisition)
  if (searchParams.vendor)      qs.set('vendor', searchParams.vendor)
  const suffix = qs.toString() ? `?${qs}` : ''
  redirect(`/kitchen/deliveries/${randomUUID()}/edit${suffix}`)
}
