import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/auth/permissions'
import { listTemplates } from '@/lib/queries/menus'

/**
 * GET /api/menus/templates?mealTypeId=…
 * Saved meal templates for the editor's "Load template" picker.
 */
export async function GET(req: NextRequest) {
  if (!(await hasPermission('menus', 'read'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const mealTypeId = searchParams.get('mealTypeId') ?? undefined

  try {
    const templates = await listTemplates(mealTypeId)
    return NextResponse.json({ templates })
  } catch {
    return NextResponse.json({ templates: [] })
  }
}
