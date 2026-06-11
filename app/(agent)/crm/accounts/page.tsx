import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { listAccounts, getAccountCounts, listSectors, listTiers } from '@/lib/queries/crm'
import { getCrmVisibility } from '@/lib/crm/visibility'
import { MigrationErrorBanner } from '@/components/crm/MigrationErrorBanner'
import { AccountFilters } from '@/components/crm/AccountFilters'
import { AccountsTable } from '@/components/crm/AccountsTable'
import { OwnerToggle } from '@/components/crm/OwnerToggle'
import type { AccountStatus } from '@/lib/supabase/types-crm'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { view?: string; status?: string; sector?: string; tier?: string; search?: string; inactive?: string }
}

export default async function AccountsPage({ searchParams }: PageProps) {
  await requirePermission('crm', 'read')
  const canWrite = await hasPermission('crm', 'write')
  const view = searchParams.view === 'all' ? 'all' : 'mine'

  let migrationError: string | null = null
  try {
    const vis = await getCrmVisibility()
    const [accounts, counts, sectors, tiers] = await Promise.all([
      listAccounts({
        ownerView:       view,
        status:          searchParams.status as AccountStatus | undefined,
        sectorId:        searchParams.sector,
        tierId:          searchParams.tier,
        search:          searchParams.search,
        includeInactive: searchParams.inactive === '1',
      }),
      getAccountCounts(),
      listSectors(),
      listTiers(),
    ])
    const showToggle = vis ? !vis.elevated : false

    return (
      <div className="flex h-full flex-col">
        <Topbar title="Accounts" subtitle="Corporate B2B accounts"
          action={canWrite ? { label: 'New account', href: '/crm/accounts/new' } : undefined} />
        <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
          {showToggle && <OwnerToggle mineCount={counts.mine} allCount={counts.all} current={view} />}
          <AccountFilters sectors={sectors} tiers={tiers} />
          <AccountsTable accounts={accounts} />
          <Link href="/crm" className="inline-block text-sm text-amber-700 hover:underline">← Back to Corporate Sales</Link>
        </div>
      </div>
    )
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Accounts" />
      <div className="px-4 py-6 sm:px-6"><MigrationErrorBanner error={migrationError!} /></div>
    </div>
  )
}
