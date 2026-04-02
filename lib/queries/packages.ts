import { createClient } from '@/lib/supabase/server'
import type { PackageRow, PackageWithPrices } from '@/lib/supabase/types'

/** Fetch all packages ordered by display_order */
export async function getPackages(): Promise<PackageRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .order('is_active', { ascending: false })
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) throw new Error(`getPackages: ${error.message}`)
  return data ?? []
}

/** Fetch only active packages (for form selectors) */
export async function getActivePackages(): Promise<PackageRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
  if (error) throw new Error(`getActivePackages: ${error.message}`)
  return data ?? []
}

/** Fetch a single package with its room prices */
export async function getPackageById(id: string): Promise<PackageWithPrices | null> {
  const supabase = createClient()
  const { data: pkg, error: pkgError } = await supabase
    .from('packages')
    .select('*')
    .eq('id', id)
    .single()
  if (pkgError) return null

  const { data: prices } = await supabase
    .from('package_room_prices')
    .select('*')
    .eq('package_id', id)

  return { ...pkg, room_prices: prices ?? [] }
}

/** Fetch all active packages with their room prices (for quote form) */
export async function getActivePackagesWithPrices(): Promise<PackageWithPrices[]> {
  const supabase = createClient()
  const { data: packages } = await supabase
    .from('packages')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })

  if (!packages?.length) return []

  const { data: prices } = await supabase
    .from('package_room_prices')
    .select('*')
    .in('package_id', packages.map((p) => p.id))

  const pricesByPackage = new Map<string, typeof prices>()
  for (const price of prices ?? []) {
    const existing = pricesByPackage.get(price.package_id) ?? []
    existing.push(price)
    pricesByPackage.set(price.package_id, existing)
  }

  return packages.map((pkg) => ({
    ...pkg,
    room_prices: pricesByPackage.get(pkg.id) ?? [],
  }))
}
