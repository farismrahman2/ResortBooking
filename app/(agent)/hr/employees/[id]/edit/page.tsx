import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { EmployeeForm } from '@/components/hr/EmployeeForm'
import { MigrationErrorBanner } from '@/components/hr/MigrationErrorBanner'
import { getEmployeeById } from '@/lib/queries/employees'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export default async function EditEmployeePage({ params }: PageProps) {
  let migrationError: string | null = null
  let employee: Awaited<ReturnType<typeof getEmployeeById>> = null
  try {
    employee = await getEmployeeById(params.id)
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }
  if (migrationError) {
    return (
      <div className="flex h-full flex-col">
        <Topbar title="Edit Employee" />
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <MigrationErrorBanner error={migrationError} />
        </div>
      </div>
    )
  }
  if (!employee) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Edit Employee" subtitle={employee.full_name} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <EmployeeForm existing={employee} />
        </div>
      </div>
    </div>
  )
}
