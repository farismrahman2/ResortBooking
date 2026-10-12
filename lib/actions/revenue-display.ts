'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { z } from 'zod'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { createServiceClient } from '@/lib/supabase/server'
import { flagAlert } from '@/lib/auth/alerts'
import { canSeeRealRevenue, monthStart } from '@/lib/revenue/display'
import type { ActionResult } from './types'

const Schema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Pick a month'),
  pct:   z.number().min(0).max(100),
})

/** Set the percentage staff see for a month (admin only). */
export async function setRevenueDisplayPct(input: { month: string; pct: number }): Promise<ActionResult> {
  const ctx = await getCurrentUserContext()
  if (!ctx || !canSeeRealRevenue(ctx.profile.role.slug)) return { success: false, error: 'Only the admin can change this.' }
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { success: false, error: parsed.error.issues[0].message }
  const month = monthStart(parsed.data.month.length === 7 ? `${parsed.data.month}-01` : parsed.data.month)
  const pct = Math.round(parsed.data.pct * 100) / 100

  const db = createServiceClient() as any   // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: before } = await db.from('revenue_display_rules').select('pct').eq('month', month).maybeSingle()
  const { error } = await db.from('revenue_display_rules')
    .upsert({ month, pct, updated_by: ctx.user_id, updated_at: new Date().toISOString() }, { onConflict: 'month' })
  if (error) return { success: false, error: error.message }

  // Admins-only Audit Log entry; the summary names the month and the new %.
  await flagAlert({
    event_type: 'revenue_display_changed', entity_type: 'revenue_display', entity_id: ctx.user_id,
    summary: `Revenue display for ${month.slice(0, 7)}: ${before ? `${Number(before.pct)}% → ` : ''}${pct}%`,
    payload: { month, old_pct: before ? Number(before.pct) : null, new_pct: pct }, created_by: ctx.user_id,
  })
  revalidateTag('revenue-display')
  revalidatePath('/settings/revenue-display')
  revalidatePath('/')
  return { success: true }
}
