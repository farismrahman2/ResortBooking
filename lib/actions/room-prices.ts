'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { canEditPrices, type PriceChange } from '@/lib/pricing/price-grid'
import { currentPrices, invalidChange, loadPriceContext, priceDb, writePriceChanges } from '@/lib/pricing/apply'

const ChangeSchema = z.object({
  package_id: z.string().uuid(),
  room_type:  z.string().min(1),
  price:      z.number().int().min(0).nullable(),
  expected:   z.number().int().min(0).nullable(),
})

export type SavePriceGridResult =
  | { success: true; saved: number }
  | { success: false; error: string; conflicts?: Array<{ package_id: string; room_type: string; current: number | null }> }

/**
 * Save the grid's changed cells in one go. Refuses — saving nothing — if
 * any cell changed since the editor loaded it, and returns those cells.
 */
export async function savePriceGrid(input: PriceChange[]): Promise<SavePriceGridResult> {
  const ctxUser = await getCurrentUserContext()
  if (!ctxUser || !canEditPrices(ctxUser.profile.role.slug)) {
    return { success: false, error: 'Only an admin, manager or MD can change room prices.' }
  }
  const parsed = z.array(ChangeSchema).min(1).max(1000).safeParse(input)
  if (!parsed.success) return { success: false, error: 'Nothing to save, or a price is not a whole number.' }

  // One change per cell — the last one wins.
  const byCell = new Map<string, PriceChange>()
  for (const c of parsed.data) byCell.set(`${c.package_id}|${c.room_type}`, c)
  const changes = [...byCell.values()]

  const db = priceDb()
  const ctx = await loadPriceContext(db)
  for (const c of changes) {
    const why = invalidChange(c, ctx)
    if (why) return { success: false, error: why }
  }

  const current = await currentPrices(db, [...new Set(changes.map((c) => c.package_id))])
  const conflicts = changes
    .map((c) => ({ c, now: current.get(`${c.package_id}|${c.room_type}`) ?? null }))
    .filter(({ c, now }) => now !== c.expected)
    .map(({ c, now }) => ({ package_id: c.package_id, room_type: c.room_type, current: now }))
  if (conflicts.length) {
    return {
      success: false, conflicts,
      error: `${conflicts.length} price${conflicts.length === 1 ? ' was' : 's were'} changed by someone else since you opened the grid. Nothing was saved — check the highlighted cells and save again.`,
    }
  }

  const real = changes.filter((c) => c.price !== c.expected)
  if (real.length === 0) return { success: true, saved: 0 }
  const err = await writePriceChanges(db, real, ctx, { userId: ctxUser.user_id, source: 'grid' })
  if (err) return { success: false, error: err }

  revalidateTag('packages')
  revalidatePath('/settings/room-prices')
  revalidatePath('/packages')
  return { success: true, saved: real.length }
}
