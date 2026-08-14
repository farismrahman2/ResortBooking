import Link from 'next/link'
import { ClipboardList, PackageCheck, Wallet, Scale, Tags, LayoutTemplate } from 'lucide-react'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'requisitions', label: 'Orders',     href: '/kitchen/requisitions', icon: ClipboardList },
  { key: 'deliveries',   label: 'Deliveries', href: '/kitchen/deliveries',   icon: PackageCheck },
  { key: 'payments',     label: 'Payments',   href: '/kitchen/payments',     icon: Wallet },
  { key: 'ledger',       label: 'Ledger',     href: '/kitchen/ledger',       icon: Scale },
  { key: 'templates',    label: 'Templates',  href: '/kitchen/templates',    icon: LayoutTemplate },
  { key: 'items',        label: 'Items',      href: '/kitchen/items',        icon: Tags },
] as const

export type KitchenTab = (typeof TABS)[number]['key']

/**
 * The module is now five screens that are used in sequence — order, receive,
 * pay, check the balance — and the sidebar only points at the first. Without
 * this, the later three are reachable only by knowing the URL.
 *
 * Scrolls horizontally rather than wrapping: five tabs and a phone.
 */
export function KitchenNav({ current }: { current: KitchenTab }) {
  return (
    <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {TABS.map((t) => {
        const Icon = t.icon
        const active = t.key === current
        return (
          <Link
            key={t.key} href={t.href}
            className={cn(
              'inline-flex min-h-[38px] flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium',
              active
                ? 'border-forest-500 bg-forest-50 text-forest-800'
                : 'border-gray-300 bg-white text-gray-700',
            )}
          >
            <Icon size={13} /> {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
