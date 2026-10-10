import { createClient } from '@/lib/supabase/server'
import { flagAlert } from '@/lib/auth/alerts'
import { isPriceable, type Cell, type PriceChange } from './price-grid'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface PriceContext {
  packages:  Map<string, { name: string; type: 'daylong' | 'night' }>
  inventory: Map<string, { display_name: string; daylong_only: boolean }>
}

export async function loadPriceContext(db: Db): Promise<PriceContext> {
  const [{ data: pkgs }, { data: inv }] = await Promise.all([
    db.from('packages').select('id, name, type'),
    db.from('room_inventory').select('room_type, display_name, daylong_only'),
  ])
  return {
    packages:  new Map(((pkgs ?? []) as Array<{ id: string; name: string; type: 'daylong' | 'night' }>).map((p) => [p.id, { name: p.name.trim(), type: p.type }])),
    inventory: new Map(((inv ?? []) as Array<{ room_type: string; display_name: string; daylong_only: boolean }>).map((r) => [r.room_type, { display_name: r.display_name, daylong_only: !!r.daylong_only }])),
  }
}

/** Current price of each (package, room) the changes touch; null = no row. */
export async function currentPrices(db: Db, packageIds: string[]): Promise<Map<string, Cell>> {
  const out = new Map<string, Cell>()
  if (packageIds.length === 0) return out
  const { data } = await db.from('package_room_prices').select('package_id, room_type, price').in('package_id', packageIds)
  for (const r of (data ?? []) as Array<{ package_id: string; room_type: string; price: number }>) {
    out.set(`${r.package_id}|${r.room_type}`, Number(r.price))
  }
  return out
}

/** Why this change cannot be saved, or null. */
export function invalidChange(c: PriceChange, ctx: PriceContext): string | null {
  const pkg = ctx.packages.get(c.package_id)
  const room = ctx.inventory.get(c.room_type)
  if (!pkg) return 'Package not found'
  if (!room) return `Unknown room type ${c.room_type}`
  if (!isPriceable(c.room_type, pkg.type, room.daylong_only)) return `${room.display_name} cannot be priced on ${pkg.name}`
  if (c.price !== null && (!Number.isSafeInteger(c.price) || c.price < 0)) return 'Prices are whole taka, 0 or more'
  return null
}

/**
 * Write the changes — upsert prices, delete "not offered" — and log ONE
 * room_prices_changed alert with every old → new. `changes` must already
 * be validated and carry the current value as `expected`.
 */
export async function writePriceChanges(
  db: Db, changes: PriceChange[], ctx: PriceContext,
  meta: { userId: string; source: 'grid' | 'package_form' },
): Promise<string | null> {
  const upserts = changes.filter((c) => c.price !== null)
    .map((c) => ({ package_id: c.package_id, room_type: c.room_type, price: c.price as number }))
  const deletes = changes.filter((c) => c.price === null)

  if (upserts.length) {
    const { error } = await db.from('package_room_prices').upsert(upserts, { onConflict: 'package_id,room_type' })
    if (error) return error.message
  }
  for (const d of deletes) {
    const { error } = await db.from('package_room_prices').delete().eq('package_id', d.package_id).eq('room_type', d.room_type)
    if (error) return error.message
  }

  const names = [...new Set(changes.map((c) => ctx.packages.get(c.package_id)?.name ?? c.package_id))]
  const show = (v: Cell) => (v === null ? 'not offered' : v === 0 ? 'complimentary only' : `৳${v.toLocaleString('en-IN')}`)
  await flagAlert({
    event_type: 'room_prices_changed', entity_type: 'package', entity_id: changes[0].package_id,
    summary: `Room prices: ${changes.length} change${changes.length === 1 ? '' : 's'} across ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`,
    payload: {
      source: meta.source,
      changes: changes.map((c) => ({
        package_id: c.package_id, package: ctx.packages.get(c.package_id)?.name,
        room_type: c.room_type, room: ctx.inventory.get(c.room_type)?.display_name,
        old: c.expected, new: c.price, old_text: show(c.expected), new_text: show(c.price),
      })),
    },
    created_by: meta.userId,
  })
  return null
}

export const priceDb = () => createClient() as Db
