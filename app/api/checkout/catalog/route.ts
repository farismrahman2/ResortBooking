import { NextResponse } from 'next/server'
import { listChargeCategories, listChargeItems } from '@/lib/queries/charge-catalog'
import { hasPermission } from '@/lib/auth/permissions'

/**
 * GET /api/checkout/catalog — returns active charge categories + items.
 *
 * Loaded on demand by <AddChargeModal> so the booking detail and checkout
 * pages don't pay the catalog query cost on every render.
 */
export async function GET() {
  if (!(await hasPermission('checkout', 'read'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  try {
    const [categories, items] = await Promise.all([
      listChargeCategories(),
      listChargeItems(),
    ])
    return NextResponse.json(
      { categories, items },
      { headers: { 'Cache-Control': 'private, max-age=30' } },
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
