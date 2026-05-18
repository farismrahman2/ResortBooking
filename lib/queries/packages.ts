import { createClient } from '@/lib/supabase/server'
import { cachedRef } from '@/lib/cache'
import type { PackageRow, PackageWithPrices } from '@/lib/supabase/types'

/** Fetch all packages (admin list view). Cached. */
export const getPackages = cachedRef<PackageRow[]>(
  'packages-all',
  async (db) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('packages')
      .select('*')
      .order('is_active', { ascending: false })
      .order('display_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) throw new Error(`getPackages: ${error.message}`)
    return (data ?? []) as PackageRow[]
  },
  { tags: ['packages'], revalidate: 300 },
)

/** Fetch only active packages (for form selectors). Cached. */
export const getActivePackages = cachedRef<PackageRow[]>(
  'packages-active',
  async (db) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (db as any)
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    if (error) throw new Error(`getActivePackages: ${error.message}`)
    return (data ?? []) as PackageRow[]
  },
  { tags: ['packages'], revalidate: 300 },
)

/** Fetch a single package with its room prices. NOT cached — used at quote
 *  creation where we want freshest pricing. */
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

/** Fetch all active packages with their room prices (for quote form). Cached. */
export const getActivePackagesWithPrices = cachedRef<PackageWithPrices[]>(
  'packages-active-with-prices',
  async (db) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbAny = db as any
    const { data: packages } = await dbAny
      .from('packages')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (!packages?.length) return []

    const { data: prices } = await dbAny
      .from('package_room_prices')
      .select('*')
      .in('package_id', packages.map((p: PackageRow) => p.id))

    const pricesByPackage = new Map<string, typeof prices>()
    for (const price of prices ?? []) {
      const existing = pricesByPackage.get(price.package_id) ?? []
      existing.push(price)
      pricesByPackage.set(price.package_id, existing)
    }

    return packages.map((pkg: PackageRow) => ({
      ...pkg,
      room_prices: pricesByPackage.get(pkg.id) ?? [],
    })) as PackageWithPrices[]
  },
  { tags: ['packages'], revalidate: 300 },
)
