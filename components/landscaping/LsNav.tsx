import Link from 'next/link'
import { LayoutDashboard, ClipboardList, Receipt, Wallet, FolderKanban, Truck, BarChart3, Users, FileCheck2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getLsMe } from '@/lib/queries/landscaping'

const TABS = [
  { key: 'overview',     label: 'Overview',     href: '/landscaping',              icon: LayoutDashboard },
  { key: 'requisitions', label: 'Requisitions', href: '/landscaping/requisitions', icon: ClipboardList },
  { key: 'bills',        label: 'Bills',        href: '/landscaping/bills',        icon: Receipt },
  { key: 'payments',     label: 'Payment records', href: '/landscaping/payments',  icon: FileCheck2 },
  { key: 'cash',         label: 'Cash & spending', href: '/landscaping/cash',      icon: Wallet },
  { key: 'projects',     label: 'Projects',     href: '/landscaping/projects',     icon: FolderKanban },
  { key: 'suppliers',    label: 'Suppliers',    href: '/landscaping/suppliers',    icon: Truck },
  { key: 'reports',      label: 'Reports',      href: '/landscaping/reports',      icon: BarChart3 },
  { key: 'team',         label: 'Team',         href: '/landscaping/team',         icon: Users },
] as const
export type LsTab = (typeof TABS)[number]['key']

/** The landscaping business's own tabs — it shares nothing with the resort. */
const MANAGERS_ONLY: LsTab[] = ['reports', 'team']

export async function LsNav({ current }: { current: LsTab }) {
  const me = await getLsMe()
  const manager = !!me && (me.is_admin || me.can_approve)
  const tabs = TABS.filter((t) => manager || !MANAGERS_ONLY.includes(t.key) || t.key === current)
  return (
    <div className="relative">
    <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 pr-8 [scrollbar-width:none] sm:pr-1">
      {tabs.map((t) => {
        const Icon = t.icon
        return (
          <Link key={t.key} href={t.href} className={cn(
            'inline-flex min-h-[40px] flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium',
            t.key === current ? 'border-forest-600 bg-forest-700 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
          )} aria-current={t.key === current ? 'page' : undefined}>
            <Icon size={14} /> {t.label}
          </Link>
        )
      })}
    </nav>
    {/* Fade on the right edge so it's clear the tabs scroll on a phone. */}
    <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-gray-50 to-transparent sm:hidden" />
    </div>
  )
}

/** Page frame shared by every landscaping screen. */
export function LsPage({ tab, children }: { tab: LsTab; children: React.ReactNode }) {
  return <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6"><LsNav current={tab} />{children}</div>
}
