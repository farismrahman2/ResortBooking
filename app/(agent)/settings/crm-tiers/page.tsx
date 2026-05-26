import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listTiers } from '@/lib/queries/crm'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { TiersEditor } from '@/components/crm/TiersEditor'

export const dynamic = 'force-dynamic'

export default async function CrmTiersSettingsPage() {
  await requirePermission('settings', 'write')

  let migrationError: string | null = null
  let tiers: Awaited<ReturnType<typeof listTiers>> = []
  try {
    tiers = await listTiers()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="CRM Tiers" subtitle="Pre-approved corporate discount per account tier" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl space-y-4">
          {migrationError ? <MigrationErrorBanner error={migrationError} /> : <TiersEditor tiers={tiers} />}
          <Link href="/settings" className="inline-block text-sm text-amber-700 hover:underline">← Back to Settings</Link>
        </div>
      </div>
    </div>
  )
}
