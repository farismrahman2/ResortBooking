import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/permissions'
import { getFieldVisitById, listFieldVisitBands } from '@/lib/queries/field-visits'
import { listSectors } from '@/lib/queries/crm'
import { listSalesEmployees } from '@/lib/queries/employees'
import { FieldVisitPrint } from '@/components/field-visits/FieldVisitPrint'
import type { CrmSector } from '@/lib/supabase/types-crm'
import type { SalesEmployee } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

export default async function FieldVisitPrintPage({ params }: { params: { id: string } }) {
  await requirePermission('field_visits', 'read')

  const [visit, bands, sectors, employees] = await Promise.all([
    getFieldVisitById(params.id),
    listFieldVisitBands(),
    listSectors().catch(() => [] as CrmSector[]),
    listSalesEmployees().catch(() => [] as SalesEmployee[]),
  ])
  if (!visit) notFound()

  return (
    <FieldVisitPrint
      visit={visit}
      sectorName={sectors.find((s) => s.id === visit.sector_id)?.display_name ?? null}
      execName={employees.find((e) => e.id === visit.sales_executive_id)?.full_name ?? null}
      ownerName={employees.find((e) => e.id === visit.follow_up_owner_id)?.full_name ?? null}
      employeeBandLabel={bands.employeeBands.find((b) => b.code === visit.employee_band)?.label ?? null}
      budgetBandLabel={bands.budgetBands.find((b) => b.code === visit.budget_per_head_band)?.label ?? null}
    />
  )
}
