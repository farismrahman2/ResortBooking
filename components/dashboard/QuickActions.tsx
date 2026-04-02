import Link from 'next/link'
import { FileText, CalendarSearch, Package } from 'lucide-react'

interface QuickActionProps {
  href: string
  label: string
  description: string
  icon: React.ReactNode
  iconBg: string
  iconColor: string
}

function QuickActionCard({ href, label, description, icon, iconBg, iconColor }: QuickActionProps) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white p-5 text-center transition-all hover:border-forest-300 hover:shadow-sm hover:bg-forest-50 group"
    >
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${iconBg} group-hover:scale-110 transition-transform`}>
        <span className={iconColor}>{icon}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900 group-hover:text-forest-800">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
    </Link>
  )
}

export function QuickActions() {
  return (
    <div className="card p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <QuickActionCard
          href="/quotes/new"
          label="New Quote"
          description="Create a quote for a guest"
          icon={<FileText size={22} />}
          iconBg="bg-forest-100"
          iconColor="text-forest-700"
        />
        <QuickActionCard
          href="/availability"
          label="Check Availability"
          description="See room availability"
          icon={<CalendarSearch size={22} />}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />
        <QuickActionCard
          href="/packages"
          label="Manage Packages"
          description="Edit packages and pricing"
          icon={<Package size={22} />}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
        />
      </div>
    </div>
  )
}
