'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { canSeeRealRevenue } from '@/lib/revenue/display'
import { todayDhaka } from '@/lib/dates'
import { runDaily, submitPeriodic, collectBatches, type Agent } from '@/lib/audit/agents'
import type { ActionResult } from './types'

/** "Run now" on Settings → AI audit (super admin only). */
export async function runAiAudit(agent: Agent): Promise<ActionResult> {
  const ctx = await getCurrentUserContext()
  if (!ctx || !canSeeRealRevenue(ctx.profile.role.slug)) return { success: false, error: 'Only the admin can run the AI audit.' }
  if (!process.env.ANTHROPIC_API_KEY) return { success: false, error: 'ANTHROPIC_API_KEY is not set in Vercel.' }
  try {
    const today = todayDhaka()
    if (agent === 'daily') await runDaily(today, 'manual')
    else await submitPeriodic(agent, today, 'manual')
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
  revalidatePath('/settings/ai-audit')
  return { success: true }
}

/** Check whether a submitted weekly/monthly report has finished. */
export async function refreshAiAudit(): Promise<ActionResult> {
  const ctx = await getCurrentUserContext()
  if (!ctx || !canSeeRealRevenue(ctx.profile.role.slug)) return { success: false, error: 'Only the admin can run the AI audit.' }
  try { await collectBatches() } catch (e) { return { success: false, error: e instanceof Error ? e.message : String(e) } }
  revalidatePath('/settings/ai-audit')
  return { success: true }
}
