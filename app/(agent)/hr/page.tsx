import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { MigrationErrorBanner } from '@/components/hr/MigrationErrorBanner'
import {
  Users, CalendarCheck2, Wallet, TrendingDown, ListChecks, ArrowRight,
} from 'lucide-react'
import { getEmployeeStats } from '@/lib/queries/employees'

export const dynamic = 'force-dynamic'

export default async function HRDashboardPage() {
  let stats: Awaited<ReturnType<typeof getEmployeeStats>> = {
    active: 0, on_leave: 0, terminated: 0, resigned: 0,
  }
  let migrationError: string | null = null
  try {
    stats = await getEmployeeStats()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  const headcount = stats.active + stats.on_leave

  return (
    <div className="flex h-full flex-col">
      <Topbar title="HR" subtitle="Staff, attendance, payroll" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        {migrationError && <MigrationErrorBanner error={migrationError} />}

        {/* Top stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Active Headcount" value={String(headcount)} accent="sky" />
          <StatCard label="Active" value={String(stats.active)} accent="emerald" />
          <StatCard label="On Leave" value={String(stats.on_leave)} accent="amber" />
          <StatCard label="Inactive" value={String(stats.terminated + stats.resigned)} accent="gray" />
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ActionCard
            href="/hr/employees"
            icon={<Users size={18} />}
            title="Employees"
            description="Add, edit, view profile, set salary"
          />
          <ActionCard
            href="/hr/attendance"
            icon={<CalendarCheck2 size={18} />}
            title="Attendance"
            description="Daily mark-up grid (Phase 3)"
          />
          <ActionCard
            href="/hr/leaves"
            icon={<ListChecks size={18} />}
            title="Leaves"
            description="Annual / sick / casual balances (Phase 3)"
          />
          <ActionCard
            href="/hr/loans"
            icon={<TrendingDown size={18} />}
            title="Loans"
            description="Multi-month staff loans (Phase 3)"
          />
          <ActionCard
            href="/hr/payroll"
            icon={<Wallet size={18} />}
            title="Payroll"
            description="Monthly preview + finalize (Phase 4)"
          />
        </div>

        <div className="flex justify-end">
          <Link href="/hr/employees/new">
            <Button variant="primary" size="md">+ Add Employee</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  label, value, accent,
}: { label: string; value: string; accent: 'sky' | 'emerald' | 'amber' | 'gray' }) {
  const accentMap = {
    sky:     'bg-sky-50 border-sky-200 text-sky-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    amber:   'bg-amber-50 border-amber-200 text-amber-900',
    gray:    'bg-gray-50 border-gray-200 text-gray-900',
  } as const
  return (
    <div className={`rounded-xl border p-4 ${accentMap[accent]}`}>
      <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}

function ActionCard({
  href, icon, title, description,
}: { href: string; icon: React.ReactNode; title: string; description: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 hover:border-sky-300 hover:bg-sky-50/40 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <ArrowRight size={16} className="text-gray-400 group-hover:text-sky-600 transition-colors" />
    </Link>
  )
}
