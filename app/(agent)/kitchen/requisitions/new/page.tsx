import { redirect } from 'next/navigation'
import { randomUUID } from 'crypto'
import { requirePermission } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

/**
 * Mints an id and opens a blank sheet. Writes NOTHING — the row is created
 * lazily on the first real edit, so opening the form to look at it doesn't
 * leave an empty requisition behind.
 */
export default async function NewRequisitionPage() {
  await requirePermission('kitchen', 'write')
  redirect(`/kitchen/requisitions/${randomUUID()}/edit`)
}
