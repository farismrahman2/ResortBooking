'use client'

import { type ReactNode } from 'react'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context'
import { Sidebar } from './Sidebar'
import type { ModuleSlug, PermissionLevel, RoleSlug } from '@/lib/supabase/types'

interface ShellProps {
  children:      ReactNode
  userEmail:     string | null
  permissions:   Record<ModuleSlug, PermissionLevel> | null
  roleLabel:     string | null
  roleSlug:      RoleSlug | null
  unreadAlerts?: number
}

function Shell({ children, userEmail, permissions, roleLabel, roleSlug, unreadAlerts }: ShellProps) {
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

      <Sidebar
        userEmail={userEmail}
        permissions={permissions}
        roleLabel={roleLabel}
        roleSlug={roleSlug}
        unreadAlerts={unreadAlerts ?? 0}
      />

      <main className="flex-1 min-w-0 overflow-y-auto scrollable">
        {children}
      </main>
    </div>
  )
}

export function LayoutShell({
  children, userEmail, permissions, roleLabel, roleSlug, unreadAlerts,
}: ShellProps) {
  return (
    <SidebarProvider>
      <Shell
        userEmail={userEmail}
        permissions={permissions}
        roleLabel={roleLabel}
        roleSlug={roleSlug}
        unreadAlerts={unreadAlerts}
      >
        {children}
      </Shell>
    </SidebarProvider>
  )
}
