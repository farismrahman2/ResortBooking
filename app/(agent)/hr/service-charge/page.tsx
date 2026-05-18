import { Topbar } from '@/components/layout/Topbar'
import { MigrationErrorBanner } from '@/components/hr/MigrationErrorBanner'
import { ServiceChargeForm } from '@/components/hr/ServiceChargeForm'
import { MonthBar } from './MonthBar'
import { getServiceChargesForMonth } from '@/lib/queries/service-charge'
import { getEmployees } from '@/lib/queries/employees'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { month?: string }
}

function defaultMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

export default async function ServiceChargePage({ searchParams }: PageProps) {
  const monthIso = searchParams.month && /^\d{4}-\d{2}-01$/.test(searchParams.month)
    ? searchParams.month
    : defaultMonth()

  let migrationError: string | null = null
  let charges: Awaited<ReturnType<typeof getServiceChargesForMonth>> = []
  let employees: Awaited<ReturnType<typeof getEmployees>> = []
  try {
    [charges, employees] = await Promise.all([
      getServiceChargesForMonth(monthIso),
      getEmployees({ limit: 100 }),
    ])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  // Build one row per active employee, pre-filled with their charge if any.
  const chargeMap = new Map(charges.map((c) => [c.employee_id, c]))
  const rows = employees.map((e) => {
    const c = chargeMap.get(e.id)
    return {
      id:            c?.id,
      employee_id:   e.id,
      full_name:     e.full_name,
      employee_code: e.employee_code,
      amount:        c ? Number(c.amount) : 0,
    }
  })

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Service Charge" subtitle="Per-staff monthly service-charge payouts" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError && <MigrationErrorBanner error={migrationError} />}
        <MonthBar monthIso={monthIso} />
        <ServiceChargeForm monthIso={monthIso} rows={rows} />
      </div>
    </div>
  )
}
