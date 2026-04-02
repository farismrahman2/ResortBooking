'use client'

import { type ReactNode } from 'react'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context'
import { Sidebar } from './Sidebar'

function Shell({ children }: { children: ReactNode }) {
  const { isOpen, close } = useSidebar()
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={close}
          aria-hidden
        />
      )}

      <Sidebar />

      <main className="flex-1 min-w-0 overflow-y-auto scrollable">
        {children}
      </main>
    </div>
  )
}

export function LayoutShell({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <Shell>{children}</Shell>
    </SidebarProvider>
  )
}
