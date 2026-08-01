import { redirect } from 'next/navigation'
import { randomUUID } from 'crypto'
import { requirePermission } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

/**
 * Opens a blank wizard. Deliberately writes NOTHING to the database.
 *
 * This used to call createDraftVisit() here, which meant merely opening the
 * form — to look at it, or by mis-tap — left an empty "Unfinished visit" row
 * behind forever. The id is now minted here and the row is created lazily by
 * the first real edit (see saveDraftVisit), so looking costs nothing.
 */
export default async function NewFieldVisitPage({
  searchParams,
}: { searchParams: { org?: string } }) {
  await requirePermission('field_visits', 'write')

  const id = randomUUID()
  const org = searchParams.org?.trim()
  redirect(`/crm/field-visits/${id}/edit/1${org ? `?org=${encodeURIComponent(org)}` : ''}`)
}
