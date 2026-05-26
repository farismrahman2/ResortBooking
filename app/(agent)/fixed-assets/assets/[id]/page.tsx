import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Printer } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getAssetById, listMaintenanceForAsset } from '@/lib/queries/fixed-assets'
import { getActivePayees } from '@/lib/queries/expenses'
import { ConditionBadge, StatusBadge } from '@/components/fixed-assets/Badges'
import { AssetDepreciationCard } from '@/components/fixed-assets/AssetDepreciationCard'
import { MaintenancePanel } from '@/components/fixed-assets/MaintenancePanel'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

export default async function AssetDetailPage({ params }: { params: { id: string } }) {
  await requirePermission('fixed_assets', 'read')
  const canWrite = await hasPermission('fixed_assets', 'write')

  const asset = await getAssetById(params.id)
  if (!asset) notFound()
  const [maintenance, payees] = await Promise.all([listMaintenanceForAsset(asset.id), getActivePayees()])
  const vendors = payees.map((p) => ({ id: p.id, name: p.name }))

  return (
    <div className="flex h-full flex-col">
      <Topbar title={asset.name} subtitle={`${asset.asset_tag} · ${asset.category?.display_name ?? ''}`}
        action={canWrite ? { label: 'Edit', href: `/fixed-assets/assets/${asset.id}/edit` } : undefined} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <ConditionBadge condition={asset.condition} />
            <StatusBadge status={asset.status} />
            <a href={`/api/fixed-assets/${asset.id}/label`} target="_blank" rel="noopener"
              className="inline-flex items-center gap-1 rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
              <Printer size={13} /> Print tag
            </a>
            {canWrite && asset.status === 'active' && (
              <Link href={`/fixed-assets/assets/${asset.id}/dispose`} className="rounded-md border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50">
                Dispose
              </Link>
            )}
          </div>

          {/* Overview */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
            <Row label="Brand / Model" value={[asset.brand, asset.model_number].filter(Boolean).join(' ') || '—'} />
            <Row label="Serial #" value={asset.serial_number ?? '—'} />
            <Row label="Acquired" value={`${asset.acquisition_date} · ${formatBDT(asset.acquisition_cost)}`} />
            <Row label="Vendor" value={asset.vendor_name ?? '—'} />
            <Row label="Location" value={[asset.location?.display_name, asset.location_notes].filter(Boolean).join(' · ') || '—'} />
            <Row label="Custodian" value={asset.custodian_name ?? '—'} />
            <Row label="Useful life" value={`${asset.useful_life_years} years`} />
            <Row label="Warranty until" value={asset.warranty_until ?? '—'} />
            {asset.notes && <Row label="Notes" value={asset.notes} />}
          </div>

          {asset.status !== 'active' && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              {asset.status === 'disposed' ? 'Disposed' : asset.status} on {asset.disposal_date}
              {asset.disposal_proceeds != null ? ` · proceeds ${formatBDT(asset.disposal_proceeds)}` : ''}
              {asset.disposal_notes ? ` · ${asset.disposal_notes}` : ''}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Depreciation</h3>
            <AssetDepreciationCard asset={asset} dep={asset.depreciation} />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Maintenance</h3>
            <MaintenancePanel assetId={asset.id} log={maintenance} vendors={vendors} canWrite={canWrite} />
          </div>

          <Link href="/fixed-assets/assets" className="inline-block text-sm text-zinc-700 hover:underline">← Back to register</Link>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="max-w-[60%] text-right font-medium text-gray-900">{value}</span>
    </div>
  )
}
