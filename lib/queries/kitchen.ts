import { createClient } from '@/lib/supabase/server'
import type {
  KitchenVendor, RequisitionWithLines, RequisitionListRow, VendorSection, VendorLine,
} from '@/lib/supabase/types-kitchen'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

export async function listKitchenVendors(): Promise<KitchenVendor[]> {
  const { data, error } = await db()
    .from('kitchen_vendors').select('*').eq('is_active', true).order('sort_order')
  if (error) throw new Error(`[kitchen.vendors] ${error.message}`)
  return (data ?? []) as KitchenVendor[]
}

/** Items available to put on a requisition, with their vendor tag and unit. */
export async function listKitchenItems(): Promise<Array<{
  id: string; name: string; kitchen_vendor_id: string | null
  unit_id: string | null; unit_label: string | null; category_name: string | null
}>> {
  const { data, error } = await db()
    .from('inv_items')
    .select('id, name, kitchen_vendor_id, unit_id, is_active, unit:inv_units(abbreviation, display_name), category:inv_categories(display_name)')
    .eq('is_active', true)
    .order('name')
    .limit(2000)
  if (error) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((i) => ({
    id: i.id, name: i.name,
    kitchen_vendor_id: i.kitchen_vendor_id ?? null,
    unit_id: i.unit_id ?? null,
    unit_label: i.unit?.abbreviation ?? i.unit?.display_name ?? null,
    category_name: i.category?.display_name ?? null,
  }))
}

export async function getRequisitionById(id: string): Promise<RequisitionWithLines | null> {
  const { data, error } = await db()
    .from('kitchen_requisitions')
    .select('*, lines:kitchen_requisition_lines(*)')
    .eq('id', id).maybeSingle()
  if (error) throw new Error(`[kitchen.getById] ${error.message}`)
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lines = ((data.lines ?? []) as any[]).sort((a, b) => a.sort_order - b.sort_order)
  return { ...data, lines } as RequisitionWithLines
}

export async function listRequisitions(filters: {
  from?: string; to?: string; status?: string; q?: string
} = {}): Promise<RequisitionListRow[]> {
  let q = db().from('kitchen_requisitions')
    .select('*, lines:kitchen_requisition_lines(id, kitchen_vendor_id)')
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (filters.status) q = q.eq('status', filters.status)
  else                q = q.neq('status', 'cancelled')
  if (filters.from)   q = q.gte('event_date', filters.from)
  if (filters.to)     q = q.lte('event_date', filters.to)
  if (filters.q)      q = q.ilike('requisition_no', `%${filters.q}%`)

  const { data, error } = await q
  if (error) throw new Error(`[kitchen.list] ${error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  if (rows.length === 0) return []

  const empIds = [...new Set(rows.map((r) => r.approved_by_employee_id).filter(Boolean))] as string[]
  const { data: emps } = empIds.length
    ? await db().from('employees').select('id, full_name').in('id', empIds)
    : { data: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nameById = new Map(((emps ?? []) as any[]).map((e) => [e.id, e.full_name]))

  return rows.map((r) => ({
    ...r,
    line_count:   (r.lines ?? []).length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vendor_count: new Set((r.lines ?? []).map((l: any) => l.kitchen_vendor_id).filter(Boolean)).size,
    approver_name: r.approved_by_employee_id ? (nameById.get(r.approved_by_employee_id) ?? null) : null,
  })) as RequisitionListRow[]
}

/**
 * Split an approved requisition into one section per vendor — this is the
 * fan-out. Vendors with nothing are still returned, because the groups post
 * "No order" on a quiet day rather than staying silent.
 */
export async function getVendorSections(requisitionId: string): Promise<VendorSection[]> {
  const [req, vendors, unitsRes] = await Promise.all([
    getRequisitionById(requisitionId),
    listKitchenVendors(),
    db().from('inv_units').select('id, abbreviation, display_name'),
  ])
  if (!req) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unitById = new Map(((unitsRes.data ?? []) as any[]).map((u) => [u.id, u.abbreviation ?? u.display_name]))

  const byVendor = new Map<string, VendorLine[]>()
  for (const l of req.lines) {
    const key = l.kitchen_vendor_id ?? '_untagged'
    const arr = byVendor.get(key) ?? []
    arr.push({
      item_name:   l.item_name,
      qty:         Number(l.qty),
      piece_count: l.piece_count === null ? null : Number(l.piece_count),
      unit_label:  l.unit_id ? (unitById.get(l.unit_id) ?? null) : null,
      notes:       l.notes,
      is_extra:    l.is_extra,
    })
    byVendor.set(key, arr)
  }

  const sections: VendorSection[] = vendors.map((v) => ({
    vendor: v, lines: byVendor.get(v.id) ?? [],
  }))

  // Untagged lines would otherwise vanish from every message — surface them
  // as their own pseudo-section so nobody silently fails to order something.
  const untagged = byVendor.get('_untagged')
  if (untagged?.length) {
    sections.push({
      vendor: {
        id: '_untagged', slug: '_untagged', display_name: 'Not assigned to a vendor',
        sort_order: 999, order_template: null, bill_template: null,
        is_active: true, created_at: '',
      },
      lines: untagged,
    })
  }
  return sections
}

/** Every kitchen-store item with its current vendor tag, for the tagging screen. */
export async function listItemsForTagging(): Promise<Array<{
  id: string; name: string; sku_code: string | null
  category_slug: string | null; category_name: string | null
  unit_label: string | null; kitchen_vendor_id: string | null
}>> {
  const { data: store } = await db().from('inv_stores').select('id').eq('slug', 'kitchen').maybeSingle()
  if (!store) return []
  const { data, error } = await db()
    .from('inv_items')
    .select('id, name, sku_code, kitchen_vendor_id, is_active, category:inv_categories(slug, display_name), unit:inv_units(abbreviation, display_name)')
    .eq('store_id', store.id)
    .eq('is_active', true)
    .order('name')
    .limit(2000)
  if (error) throw new Error(`[kitchen.itemsForTagging] ${error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((i) => ({
    id: i.id, name: i.name, sku_code: i.sku_code ?? null,
    category_slug: i.category?.slug ?? null,
    category_name: i.category?.display_name ?? null,
    unit_label: i.unit?.abbreviation ?? i.unit?.display_name ?? null,
    kitchen_vendor_id: i.kitchen_vendor_id ?? null,
  }))
}
