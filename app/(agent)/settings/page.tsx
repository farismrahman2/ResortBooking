import Link from 'next/link'
import { Users, ShieldCheck, ListChecks, Settings as SettingsIcon, Calendar, ArrowRight, Copy, Bell, Building2 } from 'lucide-react'
import { getSettings, getHolidayDates } from '@/lib/queries/settings'
import { getUnreadAlertCount } from '@/lib/auth/alerts'
import { Topbar } from '@/components/layout/Topbar'
import { SettingsForm } from '@/components/settings/SettingsForm'
import { HolidayManager } from '@/components/settings/HolidayManager'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { requirePermission } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requirePermission('settings', 'read')

  const [settings, holidays, unreadAlerts] = await Promise.all([
    getSettings(),
    getHolidayDates(),
    getUnreadAlertCount(),
  ])

  return (
    <div className="flex flex-col">
      <Topbar title="Settings" subtitle="Users, roles, and system configuration" />
      <div className="p-4 sm:p-6 space-y-6">
        {/* Hub tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <HubTile
            href="/settings/users"
            icon={<Users size={18} />}
            title="Users"
            description="Create staff logins, reset passwords, deactivate accounts"
          />
          <HubTile
            href="/settings/roles"
            icon={<ShieldCheck size={18} />}
            title="Roles & Permissions"
            description="Edit what each role can read or write per module"
          />
          <HubTile
            href="/settings/charge-catalog"
            icon={<ListChecks size={18} />}
            title="Charge Catalog"
            description="Restaurant menu and damage rates for guest checkout"
          />
          <HubTile
            href="/settings/duplicate-bookings"
            icon={<Copy size={18} />}
            title="Duplicate Bookings"
            description="Find bookings that share the same guest, date, and package — then cancel duplicates"
          />
          <HubTile
            href="/settings/audit-log"
            icon={<Bell size={18} />}
            title="Audit Log"
            description="Discounts, guest reductions, voids, refunds, and other flagged events"
            badge={unreadAlerts > 0 ? String(unreadAlerts) : undefined}
          />
          <HubTile
            href="/settings/property"
            icon={<Building2 size={18} />}
            title="Property"
            description="Total rooms (used by Reports → Operations + occupancy KPI)"
          />
        </div>

        {/* Existing system settings */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 max-w-5xl">
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <SettingsIcon size={14} className="text-slate-500" />
                  General Settings
                </span>
              </CardTitle>
            </CardHeader>
            <SettingsForm initialSettings={settings} />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                <span className="inline-flex items-center gap-2">
                  <Calendar size={14} className="text-slate-500" />
                  Holiday Dates
                </span>
              </CardTitle>
            </CardHeader>
            <HolidayManager initialHolidays={holidays} />
          </Card>
        </div>
      </div>
    </div>
  )
}

function HubTile({
  href, icon, title, description, badge,
}: { href: string; icon: React.ReactNode; title: string; description: string; badge?: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 hover:border-slate-400 hover:bg-slate-50/40 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
          {icon}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1.5">
            {title}
            {badge && (
              <span className="inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold px-1.5 min-w-[18px] h-[18px]">
                {badge}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <ArrowRight size={16} className="text-gray-400 group-hover:text-slate-600 transition-colors" />
    </Link>
  )
}
