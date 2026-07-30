import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listFieldVisits } from '@/lib/queries/field-visits'
import { listSectors } from '@/lib/queries/crm'
import { listSalesEmployees } from '@/lib/queries/employees'
import { FieldVisitsClient } from '@/components/field-visits/FieldVisitsClient'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import type { CrmSector } from '@/lib/supabase/types-crm'
import type { SalesEmployee } from '@/lib/supabase/types'
import type { FieldVisitFilters, InterestLevel, FieldVisitStatus } from '@/lib/supabase/types-field-visits'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: {
    from?: string; to?: string; exec?: string; interest?: string
    status?: string; sector?: string; overdue?: string; q?: string
  }
}

export default async function FieldVisitsPage({ searchParams }: PageProps) {
  await requirePermission('field_visits', 'read')
  const canWrite = await hasPermission('field_visits', 'write')

  const filters: FieldVisitFilters = {
    from:          searchParams.from,
    to:            searchParams.to,
    executiveId:   searchParams.exec,
    interestLevel: searchParams.interest as InterestLevel | undefined,
    status:        searchParams.status as FieldVisitStatus | undefined,
    sectorId:      searchParams.sector,
    overdueOnly:   searchParams.overdue === '1',
    search:        searchParams.q,
  }

  try {
    const [visits, sectors, employees] = await Promise.all([
      listFieldVisits(filters),
      listSectors().catch(() => [] as CrmSector[]),
      listSalesEmployees().catch(() => [] as SalesEmployee[]),
    ])

    return (
      <div className="flex h-full flex-col">
        <Topbar
          title="Field Visits"
          subtitle="Lead discovery visits — Form GCR-CS-01"
          action={canWrite ? { label: 'New visit', href: '/crm/field-visits/new' } : undefined}
        />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <FieldVisitsClient
            visits={visits}
            sectors={sectors}
            employees={employees}
            canWrite={canWrite}
            initial={{
              from: searchParams.from ?? '', to: searchParams.to ?? '',
              exec: searchParams.exec ?? '', interest: searchParams.interest ?? '',
              status: searchParams.status ?? '', sector: searchParams.sector ?? '',
              overdue: searchParams.overdue === '1', q: searchParams.q ?? '',
            }}
          />
        </div>
      </div>
    )
  } catch (err) {
    return (
      <div className="flex h-full flex-col">
        <Topbar title="Field Visits" />
        <div className="px-4 py-6 sm:px-6">
          <MigrationErrorBanner error={err instanceof Error ? err.message : String(err)} />
          <p className="mt-3 text-sm text-gray-600">
            Run <code className="rounded bg-gray-100 px-1">migrations/field-visits-module/000_create_field_visits.sql</code> in Supabase.
          </p>
        </div>
      </div>
    )
  }
}
