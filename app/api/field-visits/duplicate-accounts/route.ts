import { NextResponse } from 'next/server'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { findDuplicateAccounts } from '@/lib/queries/field-visits'

export const dynamic = 'force-dynamic'

/**
 * Step 2 duplicate hinting. Called debounced as the rep types the org name.
 * Deliberately fails soft (empty array, 200) — a hiccup here must never
 * interrupt someone typing on a phone in a client's lobby.
 */
export async function GET(req: Request) {
  const ctx = await getCurrentUserContext()
  if (!ctx) return NextResponse.json({ matches: [] })
  const lvl = ctx.permissions.field_visits
  if (lvl !== 'read' && lvl !== 'write') return NextResponse.json({ matches: [] })

  const name = new URL(req.url).searchParams.get('name') ?? ''
  try {
    const matches = await findDuplicateAccounts(name)
    return NextResponse.json({ matches })
  } catch {
    return NextResponse.json({ matches: [] })
  }
}
