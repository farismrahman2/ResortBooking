import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/permissions'
import { createDraftVisit } from '@/lib/actions/field-visits'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'

export const dynamic = 'force-dynamic'

/** Creates the draft row then hands straight off to step 1. */
export default async function NewFieldVisitPage() {
  await requirePermission('field_visits', 'write')
  const result = await createDraftVisit()
  if (result.success) redirect(`/crm/field-visits/${result.data.id}/edit/1`)

  return (
    <div className="px-4 py-6">
      <MigrationErrorBanner error={result.error} />
    </div>
  )
}
