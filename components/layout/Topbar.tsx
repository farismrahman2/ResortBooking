'use client'

import Link from 'next/link'
import { Plus, Menu } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useSidebar } from '@/lib/sidebar-context'

interface TopbarProps {
  title:    string
  subtitle?: string
  action?: {
    label: string
    href:  string
  }
}

export function Topbar({ title, subtitle, action }: TopbarProps) {
  const { toggle } = useSidebar()

  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={toggle}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">{subtitle}</p>}
        </div>
      </div>
      {action && (
        <Link href={action.href}>
          <Button variant="primary" size="md">
            <Plus size={16} />
            <span className="hidden sm:inline">{action.label}</span>
            <span className="sm:hidden">New</span>
          </Button>
        </Link>
      )}
    </header>
  )
}
