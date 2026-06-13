import { redirect } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { DataExportClient } from '@/components/settings/DataExportClient'

export const dynamic = 'force-dynamic'

export default async function DataExportPage() {
  const ctx = await getCurrentUserContext()
  if (!ctx) redirect('/login')
  if (ctx.profile.role.slug !== 'admin') redirect('/403?from=data-export')

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Data Export"
        subtitle="Download sanitized CSVs for AI analytics and projections — admin only"
      />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <DataExportClient />
      </div>
    </div>
  )
}
