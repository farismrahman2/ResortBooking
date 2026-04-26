'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  CalendarCheck,
  CalendarSearch,
  Package,
  BarChart2,
  Wallet,
  Settings,
  Leaf,
  X,
  LogOut,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/lib/sidebar-context'

const navItems = [
  { href: '/',             label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/quotes',       label: 'Quotes',       icon: FileText        },
  { href: '/bookings',     label: 'Bookings',     icon: CalendarCheck   },
  { href: '/availability', label: 'Availability', icon: CalendarSearch  },
  { href: '/analytics',    label: 'Analytics',    icon: BarChart2       },
  { href: '/expenses',     label: 'Expenses',     icon: Wallet          },
  { href: '/packages',     label: 'Packages',     icon: Package         },
  { href: '/settings',     label: 'Settings',     icon: Settings        },
]

interface SidebarProps {
  userEmail: string | null
}

export function Sidebar({ userEmail }: SidebarProps) {
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

      {/* Footer — user info + sign out */}
      <div className="border-t border-gray-200 px-3 py-3 space-y-2">
        {userEmail && (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-forest-100 text-forest-700 flex-shrink-0">
              <User size={12} />
            </div>
            <p className="text-xs text-gray-700 font-medium truncate">{userEmail}</p>
          </div>
        )}
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  )
}
