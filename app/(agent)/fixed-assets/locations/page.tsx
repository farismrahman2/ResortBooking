import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getLocationsWithCounts } from '@/lib/queries/fixed-assets'
import { MigrationErrorBanner } from '@/components/fixed-assets/MigrationErrorBanner'
import { LOCATION_TYPE_LABELS } from '@/components/fixed-assets/labels'

export const dynamic = 'force-dynamic'

export default async function LocationsPage() {
  await requirePermission('fixed_assets', 'read')

  let migrationError: string | null = null
  let locations: Awaited<ReturnType<typeof getLocationsWithCounts>> = []
  try {
    locations = await getLocationsWithCounts()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Asset Locations" subtitle="Where assets live" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {migrationError ? <MigrationErrorBanner error={migrationError} /> : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {locations.map((l) => (
                <Link key={l.id} href={`/fixed-assets/assets?location=${l.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 hover:border-zinc-300">
                  <div>
                    <p className="font-medium text-gray-900">{l.display_name}</p>
                    <p className="text-xs text-gray-400">{LOCATION_TYPE_LABELS[l.location_type]}</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{l.asset_count} assets</span>
                </Link>
              ))}
            </div>
            <Link href="/fixed-assets" className="inline-block text-sm text-zinc-700 hover:underline">← Back to Fixed Assets</Link>
          </>
        )}
      </div>
    </div>
  )
}
