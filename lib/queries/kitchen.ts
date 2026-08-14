import { createClient } from '@/lib/supabase/server'
import { cachedRef } from '@/lib/cache'
import type {
  KitchenVendor, RequisitionWithLines, RequisitionListRow, VendorSection, VendorLine,
  RequisitionLine,
} from '@/lib/supabase/types-kitchen'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

/**
 * The six vendor slots and the ~77-item catalogue are reference data: they
 * change when somebody adds an item, which is a handful of times a month, and
 * they are read on EVERY kitchen navigation — the form, the detail page, the
 * dispatch page and the tagging screen all need them. Paying two Supabase
 * round-trips per tap for rows that did not change is most of why the module
 * felt slow on a phone.
 *
 * Cached under the `kitchen-catalogue` tag; every action that writes to
 * kitchen_vendors or inv_items calls revalidateTag on it.
 */
export const KITCHEN_CATALOGUE_TAG = 'kitchen-catalogue'

export const listKitchenVendors = cachedRef<KitchenVendor[]>(
  'kitchen-vendors',
  async (sdb) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sdb as any)
      .from('kitchen_vendors').select('*').eq('is_active', true).order('sort_order')
    if (error) throw new Error(`[kitchen.vendors] ${error.message}`)
    return (data ?? []) as KitchenVendor[]
  },
  { tags: [KITCHEN_CATALOGUE_TAG], revalidate: 600 },
)

export interface PickerItemRow {
  id: string; name: string; kitchen_vendor_id: string | null
  unit_id: string | null; unit_label: string | null; category_name: string | null
  default_unit_price: number | null
}

/** Items available to put on a requisition, with their vendor tag and unit. */
export const listKitchenItems = cachedRef<PickerItemRow[]>(
  'kitchen-items',
  async (sdb) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (sdb as any)
      .from('inv_items')
      .select('id, name, kitchen_vendor_id, unit_id, default_unit_price, is_active, unit:inv_units(abbreviation, display_name), category:inv_categories(display_name)')
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
      default_unit_price: i.default_unit_price === null || i.default_unit_price === undefined
        ? null : Number(i.default_unit_price),
    }))
  },
  { tags: [KITCHEN_CATALOGUE_TAG], revalidate: 600 },
)

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
  // Only kitchen_vendor_id is read off the lines — pulling `id` as well meant
  // dragging every line row of every requisition across the wire to produce
  // two integers per card. At a couple of requisitions a day with 40 lines
  // each, 500 headers is 20,000 line rows for a list nobody scrolls past the
  // first screen of. The window is a date-descending 120 instead.
  let q = db().from('kitchen_requisitions')
    .select('*, lines:kitchen_requisition_lines(kitchen_vendor_id)')
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(120)

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
  const [req, vendors, unitLabels] = await Promise.all([
    getRequisitionById(requisitionId),
    listKitchenVendors(),
    getUnitLabels(),
  ])
  if (!req) return []
  const unitById = new Map(Object.entries(unitLabels))

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

export interface CopyableRequisition {
  id: string
  requisition_no: string
  event_date: string
  lines: Array<{
    item_id: string | null; item_name: string
    kitchen_vendor_id: string | null
    qty: number; piece_count: number | null
    unit_id: string | null; notes: string | null
  }>
}

/**
 * The last few requisitions, with their lines, to start a new sheet from.
 *
 * A resort orders very nearly the same forty things every day — the
 * quantities move with the headcount, the list barely does. Retyping it daily
 * is the single most tedious thing in this module, and the thing most likely
 * to lose an item nobody notices missing until the kitchen needs it.
 *
 * Cancelled requisitions are excluded: they were cancelled for a reason, and
 * they are the last thing anyone wants to accidentally reissue.
 */
export async function listRequisitionsForCopy(limit = 5): Promise<CopyableRequisition[]> {
  const { data, error } = await db()
    .from('kitchen_requisitions')
    .select('id, requisition_no, event_date, lines:kitchen_requisition_lines(item_id, item_name, kitchen_vendor_id, qty, piece_count, unit_id, notes, sort_order)')
    .neq('status', 'cancelled')
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[])
    .map((r) => ({
      id: r.id, requisition_no: r.requisition_no, event_date: r.event_date,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lines: ((r.lines ?? []) as any[])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((l) => ({
          item_id: l.item_id ?? null, item_name: l.item_name,
          kitchen_vendor_id: l.kitchen_vendor_id ?? null,
          qty: Number(l.qty), piece_count: l.piece_count === null ? null : Number(l.piece_count),
          unit_id: l.unit_id ?? null, notes: l.notes ?? null,
        })),
    }))
    .filter((r) => r.lines.length > 0)
}

/** Every kitchen-store item with its current vendor tag, for the tagging screen. */
export interface TaggingItemRow {
  id: string; name: string; sku_code: string | null
  category_slug: string | null; category_name: string | null
  unit_id: string | null; unit_label: string | null
  default_unit_price: number | null
  kitchen_vendor_id: string | null
}

export const listItemsForTagging = cachedRef<TaggingItemRow[]>(
  'kitchen-items-tagging',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (sdb) => {
  const db = () => sdb as any
  const { data: store } = await db().from('inv_stores').select('id').eq('slug', 'kitchen').maybeSingle()
  if (!store) return []
  const { data, error } = await db()
    .from('inv_items')
    .select('id, name, sku_code, kitchen_vendor_id, unit_id, default_unit_price, is_active, category:inv_categories(slug, display_name), unit:inv_units(abbreviation, display_name)')
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
    unit_id: i.unit_id ?? null,
    unit_label: i.unit?.abbreviation ?? i.unit?.display_name ?? null,
    default_unit_price: i.default_unit_price === null || i.default_unit_price === undefined
      ? null : Number(i.default_unit_price),
    kitchen_vendor_id: i.kitchen_vendor_id ?? null,
  }))
  },
  { tags: [KITCHEN_CATALOGUE_TAG], revalidate: 600 },
)

/** Vendor slots including hidden ones, with how many items point at each. */
export async function listVendorsWithCounts(): Promise<{
  vendors: KitchenVendor[]
  counts:  Record<string, number>
}> {
  const [{ data: vendors, error }, { data: items }] = await Promise.all([
    db().from('kitchen_vendors').select('*').order('sort_order'),
    db().from('inv_items').select('kitchen_vendor_id').not('kitchen_vendor_id', 'is', null),
  ])
  if (error) throw new Error(`[kitchen.vendorsWithCounts] ${error.message}`)
  const counts: Record<string, number> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const i of ((items ?? []) as any[])) {
    counts[i.kitchen_vendor_id] = (counts[i.kitchen_vendor_id] ?? 0) + 1
  }
  return { vendors: (vendors ?? []) as KitchenVendor[], counts }
}

/** Kitchen-store categories and all units — for the quick add-item form. */
export const listItemFormOptions = cachedRef<{
  categories: { id: string; display_name: string }[]
  units:      { id: string; display_name: string; abbreviation: string }[]
}>(
  'kitchen-item-form-options',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (sdb) => {
    const db = () => sdb as any
    const { data: store } = await db().from('inv_stores').select('id').eq('slug', 'kitchen').maybeSingle()
    const [cats, units] = await Promise.all([
      store
        ? db().from('inv_categories').select('id, display_name')
            .eq('store_id', store.id).eq('is_active', true).order('display_order')
        : Promise.resolve({ data: [] }),
      db().from('inv_units').select('id, display_name, abbreviation').order('display_order'),
    ])
    return {
      categories: (cats.data ?? []) as { id: string; display_name: string }[],
      units:      (units.data ?? []) as { id: string; display_name: string; abbreviation: string }[],
    }
  },
  { tags: [KITCHEN_CATALOGUE_TAG], revalidate: 600 },
)

/** id → abbreviation, for labelling saved lines. Cached with the catalogue. */
export const getUnitLabels = cachedRef<Record<string, string>>(
  'kitchen-unit-labels',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (sdb) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (sdb as any).from('inv_units').select('id, abbreviation, display_name')
    const map: Record<string, string> = {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const u of ((data ?? []) as any[])) map[u.id] = u.abbreviation ?? u.display_name
    return map
  },
  { tags: [KITCHEN_CATALOGUE_TAG], revalidate: 600 },
)

// ─── Dispatch log ───────────────────────────────────────────────────────────

/** vendor id → when its message was last copied. Empty means nothing sent. */
export async function getDispatchStatus(requisitionId: string): Promise<Record<string, string>> {
  const { data, error } = await db()
    .from('kitchen_requisition_dispatches')
    .select('kitchen_vendor_id, sent_at')
    .eq('requisition_id', requisitionId)
  if (error) return {}
  const map: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of ((data ?? []) as any[])) map[d.kitchen_vendor_id] = d.sent_at
  return map
}

// ─── Amendments ─────────────────────────────────────────────────────────────

export interface RequisitionFamily {
  parent:     RequisitionWithLines
  amendments: RequisitionWithLines[]
  /** Parent + approved amendments, netted per item — the order as it now stands. */
  effective:  Array<{
    item_key: string; item_name: string
    kitchen_vendor_id: string | null
    unit_id: string | null
    original: number; change: number; net: number
  }>
}

/**
 * A requisition together with its amendments, and the netted result.
 *
 * The netted view exists because the person receiving goods at 6am needs ONE
 * list. Handing them the original plus two change notes and asking them to do
 * the arithmetic on a clipboard is how 3kg becomes 30kg.
 *
 * Only APPROVED amendments count toward the net. An amendment still awaiting
 * approval has not been authorised and has not been sent — including it would
 * show an order nobody agreed to.
 */
export async function getRequisitionFamily(id: string): Promise<RequisitionFamily | null> {
  const parent = await getRequisitionById(id)
  if (!parent) return null
  // A child id may be passed in — resolve to the head of the family first.
  if (parent.parent_requisition_id) return getRequisitionFamily(parent.parent_requisition_id)

  const { data } = await db()
    .from('kitchen_requisitions')
    .select('*, lines:kitchen_requisition_lines(*)')
    .eq('parent_requisition_id', id)
    .order('amendment_seq')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const amendments = ((data ?? []) as any[]).map((a) => ({
    ...a,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lines: ((a.lines ?? []) as any[]).sort((x, y) => x.sort_order - y.sort_order),
  })) as RequisitionWithLines[]

  const acc = new Map<string, RequisitionFamily['effective'][number]>()
  // Group by item id where there is one; free-text lines fall back to their
  // name, so "2kg tomato" typed twice still nets rather than double-counting.
  const keyOf = (l: RequisitionLine) => l.item_id ?? `name:${l.item_name.toLowerCase()}`

  for (const l of parent.lines) {
    const k = keyOf(l)
    const cur = acc.get(k) ?? {
      item_key: k, item_name: l.item_name, kitchen_vendor_id: l.kitchen_vendor_id,
      unit_id: l.unit_id, original: 0, change: 0, net: 0,
    }
    cur.original += Number(l.qty)
    acc.set(k, cur)
  }
  for (const a of amendments.filter((x) => x.status === 'approved')) {
    for (const l of a.lines) {
      const k = keyOf(l)
      const cur = acc.get(k) ?? {
        item_key: k, item_name: l.item_name, kitchen_vendor_id: l.kitchen_vendor_id,
        unit_id: l.unit_id, original: 0, change: 0, net: 0,
      }
      cur.change += Number(l.qty)
      acc.set(k, cur)
    }
  }

  const effective = [...acc.values()]
    .map((e) => ({ ...e, net: e.original + e.change }))
    // A line amended down to nothing is not part of the order any more.
    .filter((e) => e.net !== 0)

  return { parent, amendments, effective }
}
