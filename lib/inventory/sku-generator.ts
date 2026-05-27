/**
 * Generate a SKU code: <STORE>-<CAT>-<NNN>, e.g. 'HK-LIN-001'.
 * Caller passes the count of items already in this store+category; returns the
 * next code. Race-safety: the action wraps INSERT in a retry loop that
 * re-queries the count on UNIQUE violation (mirrors sale-number.ts).
 */
export function formatSkuCode(storePrefix: string, categoryPrefix: string, sequenceFromZero: number): string {
  const seq = String(sequenceFromZero + 1).padStart(3, '0')
  return `${storePrefix}-${categoryPrefix}-${seq}`
}

/** Two-letter uppercase prefix from a slug (e.g. 'housekeeping' → 'HK', 'linen' → 'LIN'). */
export function storePrefixFromSlug(slug: string): string {
  if (slug === 'housekeeping') return 'HK'
  if (slug === 'kitchen')      return 'KT'
  return slug.slice(0, 2).toUpperCase()
}

export function categoryPrefixFromSlug(slug: string): string {
  // Strip trailing store-disambiguator suffixes like '_k' / '_hk'
  const base = slug.replace(/_(k|hk)$/, '')
  return base.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase()
}
