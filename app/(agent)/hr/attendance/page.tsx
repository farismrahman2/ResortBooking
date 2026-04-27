import { Topbar } from '@/components/layout/Topbar'
import { MigrationErrorBanner } from '@/components/hr/MigrationErrorBanner'
import { AttendanceGrid } from '@/components/hr/AttendanceGrid'
import { AttendanceDateBar } from './AttendanceClient'
import {
  getActiveEmployeesForGrid,
  getAttendanceMapForDate,
} from '@/lib/queries/attendance'
import { getActiveLeaveTypes } from '@/lib/queries/leaves'
import { formatDate, toISODate } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { date?: string }
}

export default async function AttendancePage({ searchParams }: PageProps) {
  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
    ? searchParams.date
    : toISODate(new Date())

  let migrationError: string | null = null
  let employees: Awaited<ReturnType<typeof getActiveEmployeesForGrid>> = []
  let attendance: Awaited<ReturnType<typeof getAttendanceMapForDate>> = {}
  let leaveTypes: Awaited<ReturnType<typeof getActiveLeaveTypes>> = []
  try {
    [employees, attendance, leaveTypes] = await Promise.all([
      getActiveEmployeesForGrid(),
      getAttendanceMapForDate(date),
      getActiveLeaveTypes(),
    ])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Attendance" subtitle={formatDate(date)} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError && <MigrationErrorBanner error={migrationError} />}
        <AttendanceDateBar date={date} />
        {employees.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <p className="text-sm font-medium text-gray-700">No active employees yet.</p>
            <p className="mt-1 text-xs text-gray-500">Add an employee first to mark attendance.</p>
          </div>
        ) : (
          <AttendanceGrid
            date={date}
            employees={employees}
            attendance={attendance}
            leaveTypes={leaveTypes}
          />
        )}
      </div>
    </div>
  )
}
