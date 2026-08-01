import { requirePermission } from '@/lib/auth/permissions'
import { listFieldVisitBands } from '@/lib/queries/field-visits'
import { listSectors } from '@/lib/queries/crm'
import { listSalesEmployees } from '@/lib/queries/employees'
import { OfflineVisitClient } from '@/components/field-visits/OfflineVisitClient'
import type { CrmSector } from '@/lib/supabase/types-crm'
import type { SalesEmployee } from '@/lib/supabase/types'
import type { FieldVisitBand } from '@/lib/supabase/types-field-visits'

export const dynamic = 'force-dynamic'

/**
 * The offline capture shell. This page is precached by the service worker, so
 * it opens with no connectivity at all.
 *
 * The reference data it needs (sectors, sales staff, bands) is fetched here
 * when online and handed to the client, which mirrors it into localStorage.
 * Offline, the client falls back to that mirror — which is why a rep must
 * open the app on signal at least once before relying on it in a dead zone.
 */
export default async function OfflineVisitPage() {
  await requirePermission('field_visits', 'write')

  let sectors:   CrmSector[]      = []
  let employees: SalesEmployee[]  = []
  let bands: { employeeBands: FieldVisitBand[]; budgetBands: FieldVisitBand[] } =
    { employeeBands: [], budgetBands: [] }

  try {
    const [s, e, b] = await Promise.all([
      listSectors().catch(() => [] as CrmSector[]),
      listSalesEmployees().catch(() => [] as SalesEmployee[]),
      listFieldVisitBands().catch(() => ({ employeeBands: [], budgetBands: [] })),
    ])
    sectors = s; employees = e
    bands = b as typeof bands
  } catch { /* offline render — the client uses its cached copy */ }

  return (
    <OfflineVisitClient
      sectors={sectors}
      employees={employees}
      employeeBands={bands.employeeBands}
      budgetBands={bands.budgetBands}
    />
  )
}
