'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/permissions'
import { coffeeShopSaleFormSchema } from '@/lib/validators/coffee-shop'
import { isStillSameDayInDhaka } from '@/lib/coffee-shop/timezone'
import { formatSaleNumber } from '@/lib/coffee-shop/sale-number'
import type { ActionResult, ActionData } from './types'

async function logHistory(
  entityId: string,
  event: 'created' | 'edited',
  action: string,
  payload: Record<string, unknown> = {},
) {
  try {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { error } = await db.from('history_log').insert({
      entity_type: 'coffee_shop_sale',
      entity_id:   entityId,
      event,
      actor:       'system',
      payload:     { action, ...payload },
    })
    if (error) console.warn(`[history_log] non-fatal: ${error.message}`)
  } catch (err) {
    console.warn(`[history_log] non-fatal:`, err)
  }
}

async function currentUserId(): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

interface SaleTotals {
  subtotal:        number
  comp_value:      number
  discount_amount: number
  net_amount:      number
}

function computeTotals(input: ReturnType<typeof coffeeShopSaleFormSchema.parse>): SaleTotals {
  let subtotal = 0
  let comp_value = 0
  for (const it of input.items) {
    const lineAmount = Number(it.quantity) * Number(it.unit_price)
    if (it.is_complimentary) comp_value += lineAmount
    else subtotal += lineAmount
  }
  let discount_amount = 0
  if (input.discount_type === 'percent') {
    discount_amount = Math.round(subtotal * Number(input.discount_value ?? 0)) / 100
  } else if (input.discount_type === 'fixed') {
    discount_amount = Math.min(Number(input.discount_value ?? 0), subtotal)
  }
  const net_amount = Math.max(0, Math.round((subtotal - discount_amount) * 100) / 100)
  return {
    subtotal:        Math.round(subtotal * 100) / 100,
    comp_value:      Math.round(comp_value * 100) / 100,
    discount_amount: Math.round(discount_amount * 100) / 100,
    net_amount,
  }
}

function computeTendered(input: ReturnType<typeof coffeeShopSaleFormSchema.parse>): number {
  return input.payments.reduce((s, p) => s + Number(p.amount ?? 0), 0)
}

/** Create a new coffee shop sale (header + items + payments). */
export async function createCoffeeShopSale(
  raw: unknown,
): Promise<ActionData<{ sale_id: string; sale_number: string }>> {
  await requirePermission('coffee_shop', 'write')
  try {
    const parsed = coffeeShopSaleFormSchema.parse(raw)

    // Validate balance: tendered must equal net_amount
    const totals = computeTotals(parsed)
    const tendered = computeTendered(parsed)
    if (Math.abs(tendered - totals.net_amount) > 0.01) {
      return { success: false, error: `Tendered (৳${tendered.toFixed(2)}) doesn't match Net (৳${totals.net_amount.toFixed(2)}).` }
    }

    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const userId = await currentUserId()

    // Generate sale number with retry on uniqueness collision (rare)
    let saleNumber = ''
    let saleId: string | null = null
    for (let attempt = 0; attempt < 5; attempt++) {
      const { count } = await db
        .from('coffee_shop_sales')
        .select('id', { count: 'exact', head: true })
        .eq('sale_date', parsed.sale_date)
      saleNumber = formatSaleNumber(parsed.sale_date, count ?? 0)

      const { data: ins, error: insErr } = await db
        .from('coffee_shop_sales')
        .insert({
          sale_number:     saleNumber,
          sale_date:       parsed.sale_date,
          status:          'completed',
          subtotal:        totals.subtotal,
          comp_value:      totals.comp_value,
          discount_type:   parsed.discount_type ?? null,
          discount_value:  parsed.discount_value ?? 0,
          discount_amount: totals.discount_amount,
          discount_reason: parsed.discount_reason ?? null,
          net_amount:      totals.net_amount,
          customer_label:  parsed.customer_label ?? null,
          notes:           parsed.notes ?? null,
          created_by:      userId,
        })
        .select('id')
        .single()
      if (!insErr && ins) {
        saleId = ins.id
        break
      }
      // 23505 = unique violation; otherwise abort
      if (insErr && !String(insErr.message).includes('duplicate')) {
        return { success: false, error: insErr.message }
      }
    }
    if (!saleId) return { success: false, error: 'Could not allocate a unique sale number after 5 attempts.' }

    // Items
    const itemRows = parsed.items.map((it, i) => ({
      sale_id:            saleId,
      charge_item_id:     it.charge_item_id ?? null,
      category_id:        it.category_id,
      description:        it.description,
      quantity:           it.quantity,
      unit_price:         it.unit_price,
      is_complimentary:   it.is_complimentary,
      comp_authorized_by: it.comp_authorized_by ?? null,
      comp_reason:        it.comp_reason ?? null,
      notes:              it.notes ?? null,
      display_order:      i,
    }))
    const { error: itemsErr } = await db.from('coffee_shop_sale_items').insert(itemRows)
    if (itemsErr) {
      // rollback the header
      await db.from('coffee_shop_sales').delete().eq('id', saleId)
      return { success: false, error: `Items insert failed: ${itemsErr.message}` }
    }

    // Payments
    const paymentRows = parsed.payments.map((p, i) => ({
      sale_id:       saleId,
      amount:        p.amount,
      method:        p.method,
      reference:     p.reference ?? null,
      display_order: i,
    }))
    const { error: paymentsErr } = await db.from('coffee_shop_sale_payments').insert(paymentRows)
    if (paymentsErr) {
      await db.from('coffee_shop_sale_items').delete().eq('sale_id', saleId)
      await db.from('coffee_shop_sales').delete().eq('id', saleId)
      return { success: false, error: `Payments insert failed: ${paymentsErr.message}` }
    }

    await logHistory(saleId, 'created', 'coffee_shop_sale_created', {
      sale_number: saleNumber, net_amount: totals.net_amount, items: parsed.items.length,
    })
    revalidatePath('/coffee-shop')
    revalidatePath('/coffee-shop/sales')
    return { success: true, data: { sale_id: saleId, sale_number: saleNumber } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Replace items + payments + recompute totals on an existing sale.
 *  Same-day-only (Dhaka time). Voided sales cannot be edited.
 */
export async function updateCoffeeShopSale(
  saleId: string,
  raw: unknown,
): Promise<ActionResult> {
  await requirePermission('coffee_shop', 'write')
  try {
    const parsed = coffeeShopSaleFormSchema.parse(raw)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: existing } = await db.from('coffee_shop_sales').select('sale_date, status').eq('id', saleId).maybeSingle()
    if (!existing) return { success: false, error: 'Sale not found.' }
    if (existing.status !== 'completed') return { success: false, error: 'Voided sales cannot be edited.' }
    if (!isStillSameDayInDhaka(existing.sale_date)) {
      return { success: false, error: `This sale was finalized on ${existing.sale_date} and can no longer be edited.` }
    }

    const totals = computeTotals(parsed)
    const tendered = computeTendered(parsed)
    if (Math.abs(tendered - totals.net_amount) > 0.01) {
      return { success: false, error: `Tendered (৳${tendered.toFixed(2)}) doesn't match Net (৳${totals.net_amount.toFixed(2)}).` }
    }

    // Update header
    const { error: updErr } = await db.from('coffee_shop_sales').update({
      subtotal:        totals.subtotal,
      comp_value:      totals.comp_value,
      discount_type:   parsed.discount_type ?? null,
      discount_value:  parsed.discount_value ?? 0,
      discount_amount: totals.discount_amount,
      discount_reason: parsed.discount_reason ?? null,
      net_amount:      totals.net_amount,
      customer_label:  parsed.customer_label ?? null,
      notes:           parsed.notes ?? null,
      updated_at:      new Date().toISOString(),
    }).eq('id', saleId)
    if (updErr) return { success: false, error: updErr.message }

    // Replace children
    await db.from('coffee_shop_sale_items').delete().eq('sale_id', saleId)
    await db.from('coffee_shop_sale_payments').delete().eq('sale_id', saleId)
    const { error: itemsErr } = await db.from('coffee_shop_sale_items').insert(
      parsed.items.map((it, i) => ({
        sale_id: saleId, charge_item_id: it.charge_item_id ?? null, category_id: it.category_id,
        description: it.description, quantity: it.quantity, unit_price: it.unit_price,
        is_complimentary: it.is_complimentary, comp_authorized_by: it.comp_authorized_by ?? null,
        comp_reason: it.comp_reason ?? null, notes: it.notes ?? null, display_order: i,
      })),
    )
    if (itemsErr) return { success: false, error: itemsErr.message }
    const { error: paymentsErr } = await db.from('coffee_shop_sale_payments').insert(
      parsed.payments.map((p, i) => ({
        sale_id: saleId, amount: p.amount, method: p.method, reference: p.reference ?? null, display_order: i,
      })),
    )
    if (paymentsErr) return { success: false, error: paymentsErr.message }

    await logHistory(saleId, 'edited', 'coffee_shop_sale_edited', {
      net_amount: totals.net_amount, items: parsed.items.length,
    })
    revalidatePath('/coffee-shop')
    revalidatePath('/coffee-shop/sales')
    revalidatePath(`/coffee-shop/sales/${saleId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Mark a sale as voided. Same-day-only. Reason required. */
export async function voidCoffeeShopSale(saleId: string, reason: string): Promise<ActionResult> {
  await requirePermission('coffee_shop', 'write')
  try {
    if (!reason || reason.trim().length < 3) return { success: false, error: 'Void reason is required (min 3 chars).' }
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any

    const { data: existing } = await db.from('coffee_shop_sales').select('sale_date, status').eq('id', saleId).maybeSingle()
    if (!existing) return { success: false, error: 'Sale not found.' }
    if (existing.status === 'voided') return { success: false, error: 'Sale is already voided.' }
    if (!isStillSameDayInDhaka(existing.sale_date)) {
      return { success: false, error: `This sale was finalized on ${existing.sale_date} and can no longer be voided.` }
    }
    const userId = await currentUserId()
    const { error } = await db.from('coffee_shop_sales').update({
      status: 'voided', voided_at: new Date().toISOString(), voided_by: userId, void_reason: reason,
    }).eq('id', saleId)
    if (error) return { success: false, error: error.message }
    await logHistory(saleId, 'edited', 'coffee_shop_sale_voided', { reason })
    revalidatePath('/coffee-shop')
    revalidatePath('/coffee-shop/sales')
    revalidatePath(`/coffee-shop/sales/${saleId}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
