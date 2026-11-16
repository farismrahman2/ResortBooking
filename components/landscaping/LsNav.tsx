import Link from 'next/link'
import { LayoutDashboard, ClipboardList, Receipt, Wallet, FolderKanban, Truck, BarChart3, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'overview',     label: 'Overview',     href: '/landscaping',              icon: LayoutDashboard },
  { key: 'requisitions', label: 'Requisitions', href: '/landscaping/requisitions', icon: ClipboardList },
  { key: 'bills',        label: 'Bills',        href: '/landscaping/bills',        icon: Receipt },
  { key: 'cash',         label: 'Cash & labour', href: '/landscaping/cash',        icon: Wallet },
  { key: 'projects',     label: 'Projects',     href: '/landscaping/projects',     icon: FolderKanban },
  { key: 'suppliers',    label: 'Suppliers',    href: '/landscaping/suppliers',    icon: Truck },
  { key: 'reports',      label: 'Reports',      href: '/landscaping/reports',      icon: BarChart3 },
  { key: 'team',         label: 'Team',         href: '/landscaping/team',         icon: Users },
] as const
export type LsTab = (typeof TABS)[number]['key']

/** The landscaping business's own tabs — it shares nothing with the resort. */
export function LsNav({ current }: { current: LsTab }) {
  return (
    <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {TABS.map((t) => {
        const Icon = t.icon
        return (
          <Link key={t.key} href={t.href} className={cn(
            'inline-flex min-h-[38px] flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium',
            t.key === current ? 'border-forest-500 bg-forest-50 text-forest-800' : 'border-gray-300 bg-white text-gray-700',
          )}>
            <Icon size={13} /> {t.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Page frame shared by every landscaping screen. */
export function LsPage({ tab, children }: { tab: LsTab; children: React.ReactNode }) {
  return <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6"><LsNav current={tab} />{children}</div>
}
