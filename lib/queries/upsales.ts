import { createClient } from '@/lib/supabase/server'

export interface UpsalesSummary {
  total_amount:        number
  total_charges:       number
  by_category: Array<{
    slug:        string
    display_name: string
    amount:      number
    qty:         number
  }>
  top_items: Array<{
    name:    string
    qty:     number
    amount:  number
    slug:    string  // category slug
  }>
  by_staff: Array<{
    user_id:   string | null
    full_name: string
    amount:    number
    qty:       number
  }>
}

/**
 * Aggregates `checkout_charges` (i.e. upsales) over a date range, joined to
 * categories + the user who added them. Only finalized OR draft checkouts —
 * voided checkouts are excluded.
 */
export async function getUpsalesSummary(args: {
  from: string   // YYYY-MM-DD
  to:   string
}): Promise<UpsalesSummary> {
  const supabase = createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data, error } = await db
    .from('checkout_charges')
    .select(`
      id, description, quantity, unit_price, amount, added_by, added_at,
      category:charge_categories!inner (slug, display_name),
      checkout:checkouts!inner (status, booking_id)
    `)
    .gte('added_at', args.from + 'T00:00:00')
    .lte('added_at', args.to   + 'T23:59:59')
    .neq('checkout.status', 'voided')
    .limit(5000)
  if (error) throw new Error(`getUpsalesSummary: ${error.message}`)

  const rows = (data ?? []) as any[]

  // Resolve user names in a separate query (avoids brittle FK embed)
  const userIds = Array.from(new Set(rows.map((r) => r.added_by).filter(Boolean))) as string[]
  const userById = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: users } = await db
      .from('user_profiles').select('user_id, full_name').in('user_id', userIds)
    for (const u of (users ?? []) as any[]) userById.set(u.user_id, u.full_name)
  }

  let total_amount = 0
  const byCategory = new Map<string, { slug: string; display_name: string; amount: number; qty: number }>()
  const itemKey = (description: string, slug: string) => `${slug}|${description}`
  const byItem = new Map<string, { name: string; slug: string; qty: number; amount: number }>()
  const byStaff = new Map<string, { user_id: string | null; full_name: string; amount: number; qty: number }>()

  for (const r of rows) {
    const amt = Number(r.amount ?? 0)
    const qty = Number(r.quantity ?? 0)
    total_amount += amt

    const slug = r.category.slug as string
    const cat = byCategory.get(slug) ?? {
      slug, display_name: r.category.display_name, amount: 0, qty: 0,
    }
    cat.amount += amt; cat.qty += qty
    byCategory.set(slug, cat)

    const ik = itemKey(r.description, slug)
    const it = byItem.get(ik) ?? { name: r.description, slug, qty: 0, amount: 0 }
    it.amount += amt; it.qty += qty
    byItem.set(ik, it)

    const uid = (r.added_by as string | null) ?? '__unknown__'
    const name = uid === '__unknown__' ? '— (unknown)' : (userById.get(uid) ?? uid.slice(0, 8))
    const sg = byStaff.get(uid) ?? { user_id: uid === '__unknown__' ? null : uid, full_name: name, amount: 0, qty: 0 }
    sg.amount += amt; sg.qty += qty
    byStaff.set(uid, sg)
  }

  return {
    total_amount,
    total_charges: rows.length,
    by_category:   Array.from(byCategory.values()).sort((a, b) => b.amount - a.amount),
    top_items:     Array.from(byItem.values()).sort((a, b) => b.amount - a.amount).slice(0, 10),
    by_staff:      Array.from(byStaff.values()).sort((a, b) => b.amount - a.amount),
  }
}
