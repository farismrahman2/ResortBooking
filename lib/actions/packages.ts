'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { PackageFormSchema, type PackageFormInput } from '@/lib/validators/package'
import type { ActionResult, ActionData } from './types'
import type { RoomType } from '@/lib/supabase/types'

/** Create a new package with room prices */
export async function createPackage(
  input: PackageFormInput,
): Promise<ActionData<{ packageId: string }>> {
  try {
    const validated = PackageFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { room_prices, ...packageData } = validated

    const { data: pkg, error: pkgError } = await db
      .from('packages')
      .insert({
        ...packageData,
        specific_dates: packageData.specific_dates ?? [],
      })
      .select('id')
      .single()

    if (pkgError || !pkg) return { success: false, error: pkgError?.message ?? 'Insert failed' }

    // Insert room prices
    const priceRows = Object.entries(room_prices).map(([room_type, price]) => ({
      package_id: pkg.id,
      room_type: room_type as RoomType,
      price: Number(price),
    }))

    if (priceRows.length > 0) {
      const { error: priceError } = await db
        .from('package_room_prices')
        .insert(priceRows)
      if (priceError) return { success: false, error: priceError.message }
    }

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
  try {
    const validated = PackageFormSchema.parse(input)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { room_prices, ...packageData } = validated

    const { error: pkgError } = await db
      .from('packages')
      .update({
        ...packageData,
        specific_dates: packageData.specific_dates ?? [],
      })
      .eq('id', id)

    if (pkgError) return { success: false, error: pkgError.message }

    // Replace room prices: delete all then insert
    await db.from('package_room_prices').delete().eq('package_id', id)

    const priceRows = Object.entries(room_prices).map(([room_type, price]) => ({
      package_id: id,
      room_type: room_type as RoomType,
      price: Number(price),
    }))

    if (priceRows.length > 0) {
      const { error: priceError } = await db
        .from('package_room_prices')
        .insert(priceRows)
      if (priceError) return { success: false, error: priceError.message }
    }

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
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db
      .from('packages')
      .update({ is_active })
      .eq('id', id)

    if (error) return { success: false, error: error.message }

    revalidatePath('/packages')
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
}

/** Duplicate a package (creates a copy with " (Copy)" suffix, inactive) */
export async function duplicatePackage(id: string): Promise<ActionData<{ packageId: string }>> {
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
