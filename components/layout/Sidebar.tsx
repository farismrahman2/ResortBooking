'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  CalendarCheck,
  CalendarSearch,
  Package,
  Settings,
  Leaf,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/lib/sidebar-context'

const navItems = [
  { href: '/',             label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/quotes',       label: 'Quotes',       icon: FileText        },
  { href: '/bookings',     label: 'Bookings',     icon: CalendarCheck   },
  { href: '/availability', label: 'Availability', icon: CalendarSearch  },
  { href: '/packages',     label: 'Packages',     icon: Package         },
  { href: '/settings',     label: 'Settings',     icon: Settings        },
]

export function Sidebar() {
  const pathname  = usePathname()
  const { isOpen, close } = useSidebar()

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-gray-200 bg-white',
        // Mobile: fixed drawer sliding in from left
        'fixed inset-y-0 left-0 z-50 w-64 transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: static, always visible
        'lg:relative lg:z-auto lg:w-60 lg:translate-x-0 lg:transition-none lg:shrink-0',
      )}
    >
      {/* Logo + mobile close button */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-forest-700">
            <Leaf size={16} className="text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-900 leading-tight">Garden Centre</p>
            <p className="text-xs text-gray-500 leading-tight">Resort Agent</p>
          </div>
        </div>
        <button
          onClick={close}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={close}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-forest-50 text-forest-800'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <Icon size={18} className={isActive ? 'text-forest-700' : 'text-gray-400'} />
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-3">
        <p className="text-xs text-gray-400">Internal Tool — No Login Required</p>
      </div>
    </aside>
  )
}
