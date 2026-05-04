import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getAttendanceReport, type DepartmentAttendanceRow, type TopAbsenteeRow } from '@/lib/queries/reports/hr'
import { ReportShell } from '@/components/reports/ReportShell'
import { KpiCard } from '@/components/reports/KpiCard'
import { SimpleTable } from '@/components/reports/SimpleTable'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: { period?: string; from?: string; to?: string; compare?: string } }

export default async function AttendanceReportPage({ searchParams }: PageProps) {
  await requirePermission('reports', 'read')
  const hrAccess = await hasPermission('hr', 'read')
  if (!hrAccess) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">HR access required to view this report.</div>
      </div>
    )
  }
  const { preset, period, mode, customFrom, customTo } = resolvePeriod(searchParams)
  const { totals, byDepartment, topAbsentees } = await getAttendanceReport(period)

  return (
    <ReportShell exportReportId="hr-attendance" title="Attendance trends" subtitle="Department breakdown + top absentees" period={period} preset={preset} customFrom={customFrom} customTo={customTo} mode={mode}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Avg attendance rate" value={`${totals.attendance_rate_pct.toFixed(1)}%`} mode="off" />
        <KpiCard label="Total absent days"   value={String(totals.total_absent_days)} mode="off" invertColour />
        <KpiCard label="Total leave days"    value={String(totals.total_leave_days)} mode="off" />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">By department</h3>
        <SimpleTable<DepartmentAttendanceRow>
          rows={byDepartment}
          columns={[
            { key: 'department',           label: 'Department' },
            { key: 'active_staff',         label: 'Active staff', align: 'right' },
            { key: 'attendance_rate_pct',  label: 'Attendance %', align: 'right', render: (r) => `${r.attendance_rate_pct.toFixed(1)}%` },
            { key: 'absent_days',          label: 'Absent',       align: 'right' },
            { key: 'paid_leave_days',      label: 'Paid leave',   align: 'right' },
            { key: 'unpaid_leave_days',    label: 'Unpaid leave', align: 'right' },
            { key: 'half_days',            label: 'Half days',    align: 'right' },
          ]}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Top absentees</h3>
        <SimpleTable<TopAbsenteeRow>
          rows={topAbsentees}
          emptyMessage="No absences recorded for this period."
          columns={[
            { key: 'full_name',     label: 'Employee' },
            { key: 'employee_code', label: 'Code' },
            { key: 'department',    label: 'Department' },
            { key: 'absent_days',   label: 'Absent days', align: 'right' },
          ]}
        />
      </div>
    </ReportShell>
  )
}
