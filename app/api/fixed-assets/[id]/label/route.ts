import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { hasPermission } from '@/lib/auth/permissions'
import { getAssetById } from '@/lib/queries/fixed-assets'
import { AssetLabelDocument } from '@/lib/fixed-assets/asset-label-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await hasPermission('fixed_assets', 'read'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const asset = await getAssetById(params.id)
  if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

  const buffer = await renderToBuffer(AssetLabelDocument({
    asset_tag:        asset.asset_tag,
    name:             asset.name,
    category:         asset.category?.display_name ?? '',
    acquisition_date: asset.acquisition_date,
  }))
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="asset-${asset.asset_tag}.pdf"`,
      'Content-Length':      String(buffer.length),
      'Cache-Control':       'no-store',
    },
  })
}
