import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { Plus } from 'lucide-react'
import { MigrationErrorBanner } from '@/components/hr/MigrationErrorBanner'
import { EmployeeTable } from '@/components/hr/EmployeeTable'
import { EmployeesFilterBar } from './EmployeesClient'
import { getEmployees } from '@/lib/queries/employees'
import type { Department, EmployeeWithCurrentSalary } from '@/lib/supabase/types'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: {
    search?:         string
    department?:     string
    showTerminated?: string
  }
}

export default async function EmployeesPage({ searchParams }: PageProps) {
  const showTerminated = searchParams.showTerminated === '1'
  const department     = (searchParams.department as Department | undefined) ?? undefined

  let rows: EmployeeWithCurrentSalary[] = []
  let migrationError: string | null = null
  try {
    rows = await getEmployees({
      search:            searchParams.search,
      department:        department ?? 'any',
      includeTerminated: showTerminated,
      status:            showTerminated ? 'any' : undefined,
      limit:             100,
    })
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Employees" subtitle="Active staff" />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError && <MigrationErrorBanner error={migrationError} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            <span className="font-medium text-gray-700">{rows.length}</span> employees shown
          </p>
          <Link href="/hr/employees/new">
            <Button variant="primary" size="md" className="gap-1.5">
              <Plus size={14} />
              Add Employee
            </Button>
          </Link>
        </div>

        <EmployeesFilterBar
          search={searchParams.search ?? ''}
          department={searchParams.department ?? ''}
          showTerminated={showTerminated}
        />

        <EmployeeTable rows={rows} />
      </div>
    </div>
  )
}
