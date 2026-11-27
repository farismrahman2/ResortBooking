'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ClipboardList, Receipt, Wallet, FolderKanban, Truck, BarChart3, Users, FileCheck2,
  MoreHorizontal, LogOut, ArrowLeft, Menu, Leaf, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebar } from '@/lib/sidebar-context'

/**
 * The Landscaping workspace frame. Its own app: a left rail on computers, a
 * bottom tab bar on phones, and a compact header on every page. People with
 * the Landscaping role see nothing of the resort; the admin keeps a way back.
 */

type Item = { key: string; label: string; short?: string; href: string; icon: typeof LayoutDashboard; manager?: boolean }
const ITEMS: Item[] = [
  { key: 'overview',     label: 'Overview',          short: 'Home',     href: '/landscaping',              icon: LayoutDashboard },
  { key: 'requisitions', label: 'Requisitions',      short: 'Requisitions', href: '/landscaping/requisitions', icon: ClipboardList },
  { key: 'payments',     label: 'Payment records',   short: 'Payments', href: '/landscaping/payments',     icon: FileCheck2 },
  { key: 'bills',        label: 'Supplier bills',    short: 'Bills',    href: '/landscaping/bills',        icon: Receipt },
  { key: 'cash',         label: 'Cash & spending',   href: '/landscaping/cash',         icon: Wallet },
  { key: 'projects',     label: 'Projects',          href: '/landscaping/projects',     icon: FolderKanban },
  { key: 'suppliers',    label: 'Suppliers',         href: '/landscaping/suppliers',    icon: Truck },
  { key: 'reports',      label: 'Reports',           href: '/landscaping/reports',      icon: BarChart3, manager: true },
  { key: 'team',         label: 'Team & lists',      href: '/landscaping/team',         icon: Users, manager: true },
]
const BOTTOM = ['overview', 'requisitions', 'payments', 'bills']

const isActive = (path: string, href: string) =>
  href === '/landscaping' ? path === '/landscaping' : path === href || path.startsWith(href + '/')

const ShellCtx = createContext<{ onlyLandscaping: boolean }>({ onlyLandscaping: false })
export const useLsShell = () => useContext(ShellCtx)

export function LsShell({ children, manager, onlyLandscaping, userName, roleLabel }: {
  children: React.ReactNode; manager: boolean; onlyLandscaping: boolean; userName: string; roleLabel: string
}) {
  const path = usePathname()
  const [more, setMore] = useState(false)
  useEffect(() => { setMore(false) }, [path])
  const items = ITEMS.filter((i) => !i.manager || manager)
  const moreItems = items.filter((i) => !BOTTOM.includes(i.key))
  const moreActive = moreItems.some((i) => isActive(path, i.href))

  const account = (
    <div className="space-y-1">
      <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-forest-100 text-xs font-semibold text-forest-800">
          {userName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-800">{userName}</p>
          <p className="truncate text-xs text-gray-500">{roleLabel}</p>
        </div>
      </div>
      {onlyLandscaping ? (
        <form action="/auth/signout" method="POST">
          <button type="submit" className="flex min-h-[40px] w-full items-center gap-2 rounded-lg px-3 text-sm text-gray-600 hover:bg-red-50 hover:text-red-700">
            <LogOut size={16} /> Sign out
          </button>
        </form>
      ) : (
        <Link href="/" className="flex min-h-[40px] items-center gap-2 rounded-lg px-3 text-sm text-gray-600 hover:bg-gray-50">
          <ArrowLeft size={16} /> Back to the resort
        </Link>
      )}
    </div>
  )

  return (
    <ShellCtx.Provider value={{ onlyLandscaping }}>
      <div className="flex min-h-full">
        {/* Computer: left rail */}
        <aside className="sticky top-0 hidden h-screen w-56 flex-shrink-0 flex-col border-r border-gray-200 bg-white lg:flex">
          <div className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-forest-700"><Leaf size={17} className="text-white" /></div>
            <div className="leading-tight">
              <p className="text-[11px] italic text-forest-700">Care with Green</p>
              <p className="text-sm font-bold text-gray-900">Landscaping</p>
            </div>
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Landscaping">
            {items.map((i) => {
              const on = isActive(path, i.href)
              const Icon = i.icon
              return (
                <Link key={i.key} href={i.href} aria-current={on ? 'page' : undefined} className={cn(
                  'flex min-h-[40px] items-center gap-3 rounded-lg px-3 text-sm font-medium',
                  on ? 'bg-forest-50 text-forest-800' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )}>
                  <Icon size={17} className={on ? 'text-forest-700' : 'text-gray-400'} /> {i.label}
                </Link>
              )
            })}
          </nav>
          <div className="border-t border-gray-100 p-2">{account}</div>
        </aside>

        {/* Page */}
        <div className="min-w-0 flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">{children}</div>
      </div>

      {/* Phone: bottom tab bar */}
      <nav aria-label="Landscaping" className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5">
          {items.filter((i) => BOTTOM.includes(i.key)).map((i) => {
            const on = isActive(path, i.href)
            const Icon = i.icon
            return (
              <li key={i.key}>
                <Link href={i.href} aria-current={on ? 'page' : undefined} className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  on ? 'text-forest-800' : 'text-gray-500',
                )}>
                  <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', on && 'bg-forest-100')}><Icon size={19} /></span>
                  {i.short ?? i.label}
                </Link>
              </li>
            )
          })}
          <li>
            <button type="button" onClick={() => setMore(true)} aria-expanded={more} className={cn(
              'flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium',
              moreActive ? 'text-forest-800' : 'text-gray-500',
            )}>
              <span className={cn('flex h-7 w-12 items-center justify-center rounded-full', moreActive && 'bg-forest-100')}><MoreHorizontal size={19} /></span>
              More
            </button>
          </li>
        </ul>
      </nav>

      {/* Phone: "More" sheet */}
      {more && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-xl">
            <div className="mb-2 flex items-center px-2">
              <p className="text-sm font-semibold text-gray-900">More</p>
              <button type="button" onClick={() => setMore(false)} aria-label="Close" className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map((i) => {
                const Icon = i.icon
                const on = isActive(path, i.href)
                return (
                  <Link key={i.key} href={i.href} className={cn(
                    'flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-xl border px-2 text-center text-xs font-medium',
                    on ? 'border-forest-300 bg-forest-50 text-forest-800' : 'border-gray-200 text-gray-700',
                  )}>
                    <Icon size={20} className={on ? 'text-forest-700' : 'text-gray-500'} /> {i.label}
                  </Link>
                )
              })}
            </div>
            <div className="mt-3 border-t border-gray-100 pt-3">{account}</div>
          </div>
        </div>
      )}
    </ShellCtx.Provider>
  )
}

/** Compact page header: back link, title, one line of context, actions on the right. */
export function LsHeader({ title, subtitle, actions, back }: {
  title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; back?: string
}) {
  const { onlyLandscaping } = useLsShell()
  const { toggle } = useSidebar()
  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6 sm:py-3">
        {back ? (
          <Link href={back} aria-label="Back" className="-ml-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"><ArrowLeft size={20} /></Link>
        ) : !onlyLandscaping ? (
          // The admin can still open the resort menu on a phone.
          <button type="button" onClick={toggle} aria-label="Open resort menu" className="-ml-2 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 lg:hidden"><Menu size={20} /></button>
        ) : (
          <div className="-ml-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-forest-700 lg:hidden"><Leaf size={15} className="text-white" /></div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-tight text-gray-900 sm:text-xl">{title}</h1>
          {subtitle && <p className="truncate text-xs text-gray-500 sm:text-sm">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
