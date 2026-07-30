import { notFound, redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/permissions'
import { getFieldVisitById, listFieldVisitBands } from '@/lib/queries/field-visits'
import { listSectors } from '@/lib/queries/crm'
import { listSalesEmployees } from '@/lib/queries/employees'
import { FieldVisitWizard } from '@/components/field-visits/FieldVisitWizard'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { TOTAL_STEPS } from '@/lib/validators/field-visits'
import type { CrmSector } from '@/lib/supabase/types-crm'
import type { SalesEmployee } from '@/lib/supabase/types'
import type { FieldVisitBand } from '@/lib/supabase/types-field-visits'

export const dynamic = 'force-dynamic'

interface PageProps { params: { id: string; step: string } }

export default async function FieldVisitStepPage({ params }: PageProps) {
  await requirePermission('field_visits', 'write')

  const step = Number(params.step)
  if (!Number.isInteger(step) || step < 1 || step > TOTAL_STEPS) {
    redirect(`/crm/field-visits/${params.id}/edit/1`)
  }

  try {
    const [visit, bands, sectors, employees] = await Promise.all([
      getFieldVisitById(params.id),
      listFieldVisitBands(),
      listSectors().catch(() => [] as CrmSector[]),
      listSalesEmployees().catch(() => [] as SalesEmployee[]),
    ])
    if (!visit) notFound()
    // A submitted/processed visit is read-only — send the user to the detail page.
    if (visit.status !== 'draft') redirect(`/crm/field-visits/${params.id}`)

    return (
      <FieldVisitWizard
        visit={visit}
        step={step}
        sectors={sectors}
        employees={employees}
        employeeBands={bands.employeeBands as FieldVisitBand[]}
        budgetBands={bands.budgetBands as FieldVisitBand[]}
      />
    )
  } catch (err) {
    // Next's redirect()/notFound() throw control-flow errors — never swallow them.
    if (err && typeof err === 'object' && 'digest' in err) throw err
    return (
      <div className="px-4 py-6">
        <MigrationErrorBanner error={err instanceof Error ? err.message : String(err)} />
      </div>
    )
  }
}
