import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/auth/permissions'
import { searchDishCatalog } from '@/lib/queries/menus'

/**
 * GET /api/menus/dishes?q=খিচু
 * Usage-ranked dish catalog search for the editor's DishPicker.
 */
export async function GET(req: NextRequest) {
  if (!(await hasPermission('menus', 'read'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const category = searchParams.get('category') ?? undefined

  try {
    const dishes = await searchDishCatalog(q, category)
    return NextResponse.json({ dishes })
  } catch {
    // Migration not applied yet — empty picker instead of a 500
    return NextResponse.json({ dishes: [] })
  }
}
