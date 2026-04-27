import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { MigrationErrorBanner } from '@/components/hr/MigrationErrorBanner'
import { SalaryStructureForm } from '@/components/hr/SalaryStructureForm'
import { TerminateEmployeeButton } from '@/components/hr/TerminateEmployeeButton'
import { AdjustmentsList } from '@/components/hr/AdjustmentsList'
import { AdjustmentForm } from '@/components/hr/AdjustmentForm'
import { EmployeeDetailTabs, ComingSoonPanel } from './EmployeeDetailTabs'
import { getEmployeeById, getSalaryHistory } from '@/lib/queries/employees'
import { getActiveLoansForEmployee } from '@/lib/queries/loans'
import { getAdjustmentsForEmployee } from '@/lib/queries/salary-adjustments'
import { getEmployeeLeaveBalances } from '@/lib/queries/leaves'
import { getAttendanceForMonth } from '@/lib/queries/attendance'
import {
  DEPARTMENT_LABELS,
  EMPLOYMENT_STATUS_BADGE,
  EMPLOYMENT_STATUS_LABELS,
  GENDER_LABELS,
  LOAN_STATUS_BADGE,
  LOAN_STATUS_LABELS,
  ATTENDANCE_STATUS_BADGE,
  ATTENDANCE_STATUS_LABELS,
} from '@/components/hr/labels'
import { formatBDT } from '@/lib/formatters/currency'
import { formatDate } from '@/lib/formatters/dates'
import { Phone, Mail, MapPin, Edit, CreditCard } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

export default async function EmployeeDetailPage({ params }: PageProps) {
  let migrationError: string | null = null
  let employee: Awaited<ReturnType<typeof getEmployeeById>> = null
  let salaryHistory: Awaited<ReturnType<typeof getSalaryHistory>> = []
  let loans: Awaited<ReturnType<typeof getActiveLoansForEmployee>> = []
  let adjustments: Awaited<ReturnType<typeof getAdjustmentsForEmployee>> = []
  let leaveBalances: Awaited<ReturnType<typeof getEmployeeLeaveBalances>> = []
  let monthAttendance: Awaited<ReturnType<typeof getAttendanceForMonth>> = []
  const now = new Date()
  const monthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  try {
    [employee, salaryHistory, loans, adjustments, leaveBalances, monthAttendance] = await Promise.all([
      getEmployeeById(params.id),
      getSalaryHistory(params.id).catch(() => [] as Awaited<ReturnType<typeof getSalaryHistory>>),
      getActiveLoansForEmployee(params.id).catch(() => [] as Awaited<ReturnType<typeof getActiveLoansForEmployee>>),
      getAdjustmentsForEmployee(params.id).catch(() => [] as Awaited<ReturnType<typeof getAdjustmentsForEmployee>>),
      getEmployeeLeaveBalances(params.id, now.getFullYear()).catch(() => [] as Awaited<ReturnType<typeof getEmployeeLeaveBalances>>),
      getAttendanceForMonth(params.id, monthIso).catch(() => [] as Awaited<ReturnType<typeof getAttendanceForMonth>>),
    ])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  if (migrationError) {
    return (
      <div className="flex h-full flex-col">
        <Topbar title="Employee" />
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <MigrationErrorBanner error={migrationError} />
        </div>
      </div>
    )
  }
  if (!employee) notFound()

  const isInactive = employee.employment_status === 'terminated' || employee.employment_status === 'resigned'

  return (
    <div className="flex h-full flex-col">
      <Topbar title={employee.full_name} subtitle={employee.designation} />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">

        {/* Header strip */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-700 font-bold">
              {employee.full_name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-mono text-gray-500">{employee.employee_code}</p>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${EMPLOYMENT_STATUS_BADGE[employee.employment_status]}`}
              >
                {EMPLOYMENT_STATUS_LABELS[employee.employment_status]}
              </span>
              {employee.is_live_in && (
                <span className="ml-2 text-[10px] uppercase font-semibold text-indigo-600">live-in</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/hr/employees/${employee.id}/edit`}>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Edit size={12} /> Edit
              </Button>
            </Link>
            <TerminateEmployeeButton employeeId={employee.id} isInactive={isInactive} />
          </div>
        </div>

        {/* Tabs */}
        <EmployeeDetailTabs
          tabs={[
            {
              key:   'profile',
              label: 'Profile',
              content: (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card title="Identity">
                    <Field label="Full Name" value={employee.full_name} />
                    <Field label="Designation" value={employee.designation} />
                    <Field label="Department" value={DEPARTMENT_LABELS[employee.department]} />
                    <Field label="Joining Date" value={formatDate(employee.joining_date)} />
                    {isInactive && employee.termination_date && (
                      <>
                        <Field label="Termination Date" value={formatDate(employee.termination_date)} />
                        <Field label="Reason" value={employee.termination_reason ?? '—'} />
                      </>
                    )}
                  </Card>
                  <Card title="Contact">
                    <Field icon={<Phone size={12} />} label="Phone" value={employee.phone} />
                    <Field icon={<Mail size={12} />}  label="Email" value={employee.email ?? '—'} />
                    <Field icon={<MapPin size={12} />} label="Present Address"   value={employee.present_address ?? '—'} />
                    <Field icon={<MapPin size={12} />} label="Permanent Address" value={employee.permanent_address ?? '—'} />
                  </Card>
                  <Card title="Personal">
                    <Field icon={<CreditCard size={12} />} label="NID" value={employee.nid_number ?? '—'} />
                    <Field label="Date of Birth" value={employee.date_of_birth ? formatDate(employee.date_of_birth) : '—'} />
                    <Field label="Gender" value={employee.gender ? GENDER_LABELS[employee.gender] : '—'} />
                    <Field label="Blood Group" value={employee.blood_group ?? '—'} />
                  </Card>
                  <Card title="Emergency Contact">
                    <Field label="Name" value={employee.emergency_contact_name ?? '—'} />
                    <Field label="Phone" value={employee.emergency_contact_phone ?? '—'} />
                    <Field label="Relation" value={employee.emergency_contact_relation ?? '—'} />
                  </Card>
                  {employee.notes && (
                    <Card title="Notes" className="lg:col-span-2">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{employee.notes}</p>
                    </Card>
                  )}
                </div>
              ),
            },
            {
              key:   'salary',
              label: 'Salary',
              content: (
                <div className="space-y-4">
                  {employee.current_salary ? (
                    <Card title="Current Structure">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <Field label="Effective From" value={formatDate(employee.current_salary.effective_from)} />
                        <Field label="Basic"   value={formatBDT(Number(employee.current_salary.basic))} mono />
                        <Field label="House Rent" value={formatBDT(Number(employee.current_salary.house_rent))} mono />
                        <Field label="Medical" value={formatBDT(Number(employee.current_salary.medical))} mono />
                        <Field label="Transport" value={formatBDT(Number(employee.current_salary.transport))} mono />
                        <Field label="Mobile"  value={formatBDT(Number(employee.current_salary.mobile))} mono />
                        <Field label="Other"   value={formatBDT(Number(employee.current_salary.other_allowance))} mono />
                        <div className="col-span-2 sm:col-span-3 rounded-lg border border-sky-200 bg-sky-50 p-3">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-sky-700">Gross</p>
                          <p className="font-mono text-xl font-bold text-sky-900 tabular-nums">
                            {formatBDT(Number(employee.current_salary.gross))}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ) : (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                      No salary structure set yet — use the form below to set the initial structure.
                    </div>
                  )}

                  <SalaryStructureForm employeeId={employee.id} current={employee.current_salary} />

                  {salaryHistory.length > 1 && (
                    <Card title="History">
                      <div className="overflow-x-auto -mx-2">
                        <table className="w-full text-sm min-w-[640px]">
                          <thead className="border-b border-gray-200 bg-gray-50">
                            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                              <th className="px-3 py-2 font-medium">Effective</th>
                              <th className="px-3 py-2 font-medium">Closed On</th>
                              <th className="px-3 py-2 text-right font-medium">Basic</th>
                              <th className="px-3 py-2 text-right font-medium">Gross</th>
                              <th className="px-3 py-2 font-medium">Notes</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {salaryHistory.map((s) => (
                              <tr key={s.id}>
                                <td className="px-3 py-2 whitespace-nowrap">{formatDate(s.effective_from)}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                                  {s.effective_to ? formatDate(s.effective_to) : <span className="font-semibold text-emerald-700">current</span>}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatBDT(Number(s.basic))}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold">{formatBDT(Number(s.gross))}</td>
                                <td className="px-3 py-2 text-xs text-gray-500">{s.notes ?? '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                </div>
              ),
            },
            {
              key:   'attendance',
              label: 'Attendance',
              content: monthAttendance.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
                  No attendance marked for this month yet.{' '}
                  <Link href={`/hr/attendance`} className="text-sky-700 hover:underline">Go to grid</Link>
                </div>
              ) : (
                <Card title={`This Month (${monthIso})`}>
                  <div className="flex flex-wrap gap-2">
                    {monthAttendance.map((a) => (
                      <span
                        key={a.id}
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ATTENDANCE_STATUS_BADGE[a.status]}`}
                        title={a.date}
                      >
                        {a.date.slice(8, 10)} · {ATTENDANCE_STATUS_LABELS[a.status]}
                      </span>
                    ))}
                  </div>
                </Card>
              ),
            },
            {
              key:   'leaves',
              label: 'Leaves',
              content: leaveBalances.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
                  No leave balances initialized.{' '}
                  <Link href="/hr/leaves" className="text-sky-700 hover:underline">Initialize year</Link>
                </div>
              ) : (
                <Card title={`Year ${now.getFullYear()}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {leaveBalances.map((b) => (
                      <div key={b.id} className="rounded-lg border border-gray-200 p-3">
                        <p className="text-xs font-semibold text-sky-700">{b.leave_type.name}</p>
                        <p className="mt-1 text-sm text-gray-700 font-mono tabular-nums">
                          Used <span className="text-gray-900 font-semibold">{b.used.toFixed(1)}</span> / Available <span className="text-emerald-700 font-semibold">{b.available.toFixed(1)}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              ),
            },
            {
              key:   'loans',
              label: 'Loans',
              content: loans.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-600">
                  No active loans.{' '}
                  <Link href="/hr/loans" className="text-sky-700 hover:underline">Record one</Link>
                </div>
              ) : (
                <Card title="Active Loans">
                  <ul className="space-y-2">
                    {loans.map((l) => (
                      <li key={l.id} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{formatBDT(Number(l.outstanding))} outstanding</p>
                          <p className="text-xs text-gray-500">
                            ৳{l.monthly_installment}/mo · taken {formatDate(l.taken_on)}
                          </p>
                        </div>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${LOAN_STATUS_BADGE[l.status]}`}>
                          {LOAN_STATUS_LABELS[l.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ),
            },
            {
              key:   'adjustments',
              label: 'Adjustments',
              content: (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-500">Fines, bonuses, advances scoped to a payroll month.</p>
                    <AdjustmentForm employeeId={employee.id} />
                  </div>
                  <AdjustmentsList rows={adjustments} />
                </div>
              ),
            },
            { key: 'payroll', label: 'Payroll', content: <ComingSoonPanel phase="Phase 4" /> },
          ]}
        />
      </div>
    </div>
  )
}

function Card({
  title, children, className,
}: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3 ${className ?? ''}`}>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-sky-700">{title}</h3>
      {children}
    </div>
  )
}

function Field({
  label, value, icon, mono,
}: { label: string; value: string; icon?: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 inline-flex items-center gap-1">
        {icon}{label}
      </p>
      <p className={`text-sm text-gray-900 ${mono ? 'font-mono tabular-nums' : ''}`}>{value}</p>
    </div>
  )
}
