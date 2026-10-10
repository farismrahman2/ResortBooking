'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { PackageFormSchema, type PackageFormInput } from '@/lib/validators/package'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { canEditPrices, isPriceable, type PriceChange } from '@/lib/pricing/price-grid'
import { currentPrices, loadPriceContext, writePriceChanges } from '@/lib/pricing/apply'

const PRICE_ROLE_ERROR = 'Only an admin, manager or MD can set room prices — nothing was saved.'

/**
 * The form's room prices as changes against what is stored: one per cell
 * that differs (a room left out = not offered). Cells the package cannot
 * price (conference room, day-only rooms on a night package) are ignored.
 */
async function formPriceChanges(
  db: any, packageId: string | null, packageType: 'daylong' | 'night', roomPrices: Record<string, number>,   // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<{ changes: PriceChange[]; ctx: Awaited<ReturnType<typeof loadPriceContext>> }> {
  const ctx = await loadPriceContext(db)
  const current = packageId ? await currentPrices(db, [packageId]) : new Map<string, number | null>()
  const ok = (t: string) => ctx.inventory.has(t) && isPriceable(t, packageType, ctx.inventory.get(t)!.daylong_only)
  const changes: PriceChange[] = []
  const pid = packageId ?? 'new'
  for (const [room_type, price] of Object.entries(roomPrices)) {
    if (!ok(room_type)) continue
    const was = current.get(`${pid}|${room_type}`) ?? null
    if (was !== Number(price)) changes.push({ package_id: pid, room_type, price: Number(price), expected: was })
  }
  for (const [key, was] of current) {
    const room_type = key.split('|')[1]
    if (!(room_type in roomPrices) && ok(room_type)) changes.push({ package_id: pid, room_type, price: null, expected: was })
  }
  return { changes, ctx }
}
import type { ActionResult, ActionData } from './types'
import type { RoomType } from '@/lib/supabase/types'

/** Create a new package with room prices */
export async function createPackage(
  input: PackageFormInput,
): Promise<ActionData<{ packageId: string }>> {
  await requirePermission('bookings', 'write')
  try {
    const validated = PackageFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { room_prices, ...packageData } = validated
    const user = await getCurrentUserContext()
    const { changes, ctx } = await formPriceChanges(db, null, packageData.type as 'daylong' | 'night', room_prices as Record<string, number>)
    if (changes.length && !canEditPrices(user?.profile.role.slug)) return { success: false, error: PRICE_ROLE_ERROR }

    const { data: pkg, error: pkgError } = await db
      .from('packages')
      .insert({
        ...packageData,
        specific_dates: packageData.specific_dates ?? [],
      })
      .select('id')
      .single()

    if (pkgError || !pkg) return { success: false, error: pkgError?.message ?? 'Insert failed' }

    // Room prices — through the same path as the Room prices grid, logged.
    if (changes.length) {
      ctx.packages.set(pkg.id, { name: String(packageData.name).trim(), type: packageData.type as 'daylong' | 'night' })
      const err = await writePriceChanges(db, changes.map((c) => ({ ...c, package_id: pkg.id })), ctx, { userId: user!.user_id, source: 'package_form' })
      if (err) return { success: false, error: err }
    }

    revalidateTag('packages')
    revalidatePath('/packages')
    return { success: true, data: { packageId: pkg.id } }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

/** Update an existing package and replace its room prices */
export async function updatePackage(
  id: string,
  input: PackageFormInput,
): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  try {
    const validated = PackageFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { room_prices, ...packageData } = validated
    // Price changes need a price editor; checked before anything is written.
    const user = await getCurrentUserContext()
    const { changes, ctx } = await formPriceChanges(db, id, packageData.type as 'daylong' | 'night', room_prices as Record<string, number>)
    if (changes.length && !canEditPrices(user?.profile.role.slug)) return { success: false, error: PRICE_ROLE_ERROR }

    const { error: pkgError } = await db
      .from('packages')
      .update({
        ...packageData,
        specific_dates: packageData.specific_dates ?? [],
      })
      .eq('id', id)

    if (pkgError) return { success: false, error: pkgError.message }

    // Only the prices that changed — the old delete-all-then-insert could
    // leave a package with no prices on a failed insert, and wiped edits
    // made in the Room prices grid at the same time. Logged to the Audit Log.
    if (changes.length) {
      ctx.packages.set(id, { name: String(packageData.name).trim(), type: packageData.type as 'daylong' | 'night' })
      const err = await writePriceChanges(db, changes, ctx, { userId: user!.user_id, source: 'package_form' })
      if (err) return { success: false, error: err }
    }

    revalidateTag('packages')
    revalidatePath('/packages')
    revalidatePath(`/packages/${id}`)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err?.message ?? String(err) }
  }
}

/** Toggle package active/inactive */
export async function togglePackageActive(
  id: string,
  is_active: boolean,
): Promise<ActionResult> {
  await requirePermission('bookings', 'write')
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db
      .from('packages')
      .update({ is_active })
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    revalidateTag('packages')
    revalidatePath('/packages')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Duplicate a package (creates a copy with " (Copy)" suffix, inactive) */
export async function duplicatePackage(id: string): Promise<ActionData<{ packageId: string }>> {
  await requirePermission('bookings', 'write')
  // A copy carries every room price — the same people who set prices may make one.
  if (!canEditPrices((await getCurrentUserContext())?.profile.role.slug)) return { success: false, error: PRICE_ROLE_ERROR }
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: original } = await db.from('packages').select('*').eq('id', id).single()
    const { data: prices }   = await db.from('package_room_prices').select('*').eq('package_id', id)

    if (!original) return { success: false, error: 'Package not found' }

    const { id: _id, created_at, updated_at, ...rest } = original
    const { data: copy, error: copyError } = await db
      .from('packages')
      .insert({ ...rest, name: `${original.name} (Copy)`, is_active: false })
      .select('id')
      .single()

    if (copyError || !copy) return { success: false, error: copyError?.message ?? 'Duplicate failed' }

    if (prices?.length) {
      await db.from('package_room_prices').insert(
        prices.map(({ id: _pid, package_id: _pkg, ...p }: any) => ({ ...p, package_id: copy.id })),
      )
    }

    revalidateTag('packages')
    revalidatePath('/packages')
    return { success: true, data: { packageId: copy.id } }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Archive (soft-delete) a package by deactivating it */
export async function archivePackage(id: string): Promise<ActionResult> {
  return togglePackageActive(id, false)
}
