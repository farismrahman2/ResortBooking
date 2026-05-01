import { unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Reference-data cache helper.
 *
 * Wraps a query that pulls rarely-changing reference data (settings, packages,
 * room_inventory, charge catalog, etc.) so we don't pay the Supabase round-trip
 * on every page navigation.
 *
 * Why service-role client?
 *   `unstable_cache`'s callback can't access cookies/headers. The standard
 *   `createClient()` (cookie-based) would throw. Reference tables have RLS
 *   policies that allow ALL authenticated users equally — there's no per-user
 *   filtering — so reading via the service role returns identical data.
 *
 * Usage:
 *   export const getSettings = cachedRef(
 *     'settings',
 *     async (db) => {
 *       const { data } = await db.from('settings').select('*')
 *       return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
 *     },
 *     { tags: ['settings'], revalidate: 300 },
 *   )
 *
 * Invalidation:
 *   In the matching mutation, call `revalidateTag('settings')`.
 */
type ServiceClient = ReturnType<typeof createServiceClient>

export function cachedRef<T>(
  key: string,
  fn: (db: ServiceClient) => Promise<T>,
  opts: { tags?: string[]; revalidate?: number } = {},
): () => Promise<T> {
  return unstable_cache(
    () => fn(createServiceClient()),
    [key],
    {
      tags:       opts.tags ?? [key],
      revalidate: opts.revalidate ?? 300,   // 5 minutes default
    },
  )
}
