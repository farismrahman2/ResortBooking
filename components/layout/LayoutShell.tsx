'use client'

import { type ReactNode } from 'react'
import { SidebarProvider, useSidebar } from '@/lib/sidebar-context'
import { Toaster } from '@/components/ui/Toaster'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { Sidebar } from './Sidebar'
import type { ModuleSlug, PermissionLevel, RoleSlug } from '@/lib/supabase/types'

interface ShellProps {
  children:      ReactNode
  userEmail:     string | null
  permissions:   Record<ModuleSlug, PermissionLevel> | null
  roleLabel:     string | null
  roleSlug:      RoleSlug | null
  unreadAlerts?: number
  unreadEnquiries?: number
}

function Shell({ children, userEmail, permissions, roleLabel, roleSlug, unreadAlerts, unreadEnquiries }: ShellProps) {
  const { isOpen, close } = useSidebar()
  return (
    // A whisper of forest in the page background — enough to read as warm
    // rather than clinical, not enough to tint the white cards sitting on it.
    <div className="flex h-screen overflow-hidden bg-forest-50/40">
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
        unreadEnquiries={unreadEnquiries ?? 0}
      />

      <main className="flex-1 min-w-0 overflow-y-auto scrollable">
        {children}
      </main>

      <Toaster />
    </div>
  )
}

export function LayoutShell({
  children, userEmail, permissions, roleLabel, roleSlug, unreadAlerts, unreadEnquiries,
}: ShellProps) {
  return (
    <SidebarProvider>
      <ConfirmProvider>
        <Shell
          userEmail={userEmail}
          permissions={permissions}
          roleLabel={roleLabel}
          roleSlug={roleSlug}
          unreadAlerts={unreadAlerts}
          unreadEnquiries={unreadEnquiries}
        >
          {children}
        </Shell>
      </ConfirmProvider>
    </SidebarProvider>
  )
}
