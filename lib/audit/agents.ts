import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/server'
import { addDaysIso } from '@/lib/dates'
import { runChecks } from './collect'
import { weeklyContext, monthlyContext, findingsSummary } from './context'
import type { Finding } from './types'

/**
 * AI AUDIT agents. Code finds the facts (lib/audit/checks); the models only
 * explain them:
 *   daily   — Claude Haiku 5.5, direct call: "top things to fix today"
 *   weekly  — Claude Sonnet 5.5 via the Message Batches API (half price)
 *   monthly — Claude Opus 5.5 via the Message Batches API
 * Reports land in ai_audit_reports (service role only; shown on
 * Settings → AI audit to the super admin).
 */

export type Agent = 'daily' | 'weekly' | 'monthly'

export const MODELS: Record<Agent, string> = {
  daily:   'claude-haiku-5-5',
  weekly:  'claude-sonnet-5-5',
  monthly: 'claude-opus-5-5',
}
/** US$ per million tokens [input, output]. Batches are billed at half. */
const PRICES: Record<string, [number, number]> = {
  'claude-haiku-5-5':  [0.10, 0.50],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5':   [4, 20],
}
export function costUsd(model: string, input: number, output: number, batch: boolean): number {
  const [i, o] = PRICES[model] ?? [0, 0]
  return ((input * i + output * o) / 1e6) * (batch ? 0.5 : 1)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as any
/** A key that isn't scoped to a workspace must name one on every request
 *  (Vercel → ANTHROPIC_WORKSPACE_ID, from Console → Settings → Workspaces). */
const client = () => new Anthropic({
  maxRetries: 2, timeout: 50_000,
  ...(process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { 'anthropic-workspace-id': process.env.ANTHROPIC_WORKSPACE_ID } } : {}),
})

const RESORT = 'Garden Centre Resort, a day-visit and overnight resort in Kaliganj, Gazipur, Bangladesh. Money is in Bangladeshi taka (write "Tk").'

const DAILY_SYSTEM = `You write the morning checklist for the owner of ${RESORT}
You receive the results of automatic checks run on the booking, expense and inventory records.
Write "Top things to fix today": at most 7 numbered items, most urgent first. For each, one plain sentence on what is wrong and one on what to do, and name who usually handles it (front desk, accounts, store, kitchen, manager). Group small low-severity items into one line at the end.
Use only the facts given — do not invent numbers, causes or names. Short, plain English a busy owner can read in a minute. Markdown, no headings, no preamble.`

const WEEKLY_SYSTEM = `You are the operations and cost analyst for ${RESORT}
You receive this week's and last week's figures (bookings, revenue, occupancy, discounts, expenses), costs and stock for the month so far, and the open issues from the daily checks.
Write the weekly report with these sections:
## The week in brief — 3 to 5 bullets: what changed against last week, with numbers.
## Where money is leaking — costs, discounts, unpaid dues, stock and kitchen issues, each with the Tk amount when known.
## Cost control — spend by category, kitchen purchases, payroll as a share of revenue when both are given.
## 5 actions for next week — numbered, concrete, each with who should do it.
Use only the figures given; if something can't be judged from the data, say so in one line instead of guessing. Plain English, no filler.`

const MONTHLY_SYSTEM = `You are the business adviser to the owner of ${RESORT}
You receive 12 months of summarised figures (revenue, occupancy, packages, room types, weekdays, discounts, lead times, expenses), what is already booked for the next 90 days, costs, payroll, stock, the corporate sales pipeline, enquiries, guest feedback and the open issues from the daily checks.
Write the monthly business direction report:
## Where the business stands — the trend (growing, flat or slipping) and the reasons, with numbers.
## Pricing and packages — what to push, raise, drop or bundle; weekday vs weekend; room types that over- or under-perform.
## Where money leaks — costs, discounts, unpaid dues, stock and food cost.
## Sales and marketing timing — slow periods ahead (from what is on the books), lead-time patterns, corporate opportunities.
## Risks
## 90-day action plan — numbered, each with an owner and a measurable target.
Ground every claim in the figures given. Where the data can't support a conclusion, say what would need to be tracked instead. Plain English for an owner, not a consultant.`

function textOf(content: Anthropic.ContentBlock[]): string {
  return content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('\n').trim()
}

async function lastReport(agent: Agent) {
  const { data } = await db().from('ai_audit_reports').select('*').eq('agent', agent).eq('status', 'done')
    .order('created_at', { ascending: false }).limit(1)
  return data?.[0] ?? null
}

const fingerprint = (fs: Finding[]) => fs.map((f) => `${f.id}:${f.count}`).sort().join('|')

/** Daily checker: rule checks, then a short Haiku summary. Skips the AI call
 *  when nothing changed since the last report. */
export async function runDaily(today: string, triggeredBy: 'cron' | 'manual') {
  const { findings, errors } = await runChecks(today)
  const prev = await lastReport('daily')
  const base = { agent: 'daily', period_start: today, period_end: today, findings, model: MODELS.daily, triggered_by: triggeredBy }

  if (findings.length === 0) {
    return save({ ...base, report: errors.length ? null : 'Nothing to fix today — every check passed.', error: errors.join('\n') || null })
  }
  if (prev && fingerprint(prev.findings ?? []) === fingerprint(findings) && prev.report) {
    return save({ ...base, report: prev.report, error: errors.join('\n') || null })
  }
  try {
    const res = await client().messages.create({
      model: MODELS.daily,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      system: DAILY_SYSTEM,
      messages: [{ role: 'user', content: `Today is ${today}. Check results (JSON):\n${JSON.stringify(findings.map((f) => ({
        area: f.area, severity: f.severity, issue: f.title, count: f.count, ...(f.amount ? { taka_at_stake: f.amount } : {}),
        examples: f.examples.slice(0, 3).map((e) => e.ref),
      })))}` }],
    })
    const report = res.stop_reason === 'refusal' ? null : textOf(res.content)
    return save({
      ...base, report, error: [res.stop_reason === 'refusal' ? 'The model declined to write this report.' : null, ...errors].filter(Boolean).join('\n') || null,
      input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens,
      cost_usd: costUsd(MODELS.daily, res.usage.input_tokens, res.usage.output_tokens, false),
    })
  } catch (e) {
    return save({ ...base, status: 'failed', report: null, error: [errorText(e), ...errors].join('\n') })
  }
}

/** Weekly / monthly: build the context and submit it as a one-request batch.
 *  The daily run collects the result when the batch has ended. */
export async function submitPeriodic(agent: 'weekly' | 'monthly', today: string, triggeredBy: 'cron' | 'manual') {
  const prevDaily = await lastReport('daily')
  const findings: Finding[] = prevDaily?.findings ?? (await runChecks(today)).findings
  const context = agent === 'weekly' ? await weeklyContext(today, findings) : await monthlyContext(today, findings)
  const periodStart = agent === 'weekly' ? addDaysIso(today, -6) : `${addDaysIso(`${today.slice(0, 7)}-01`, -1).slice(0, 7)}-01`   // the month just ended
  const base = { agent, period_start: periodStart, period_end: today, findings: findingsSummary(findings), model: MODELS[agent], triggered_by: triggeredBy }
  try {
    const batch = await client().messages.batches.create({
      requests: [{
        custom_id: `${agent}-${today}`,
        params: {
          model: MODELS[agent],
          max_tokens: agent === 'weekly' ? 8000 : 16000,
          output_config: { effort: agent === 'weekly' ? 'medium' : 'high' },
          system: agent === 'weekly' ? WEEKLY_SYSTEM : MONTHLY_SYSTEM,
          messages: [{ role: 'user', content: `Today is ${today}. Figures (JSON):\n${JSON.stringify(context)}` }],
        },
      }],
    })
    return save({ ...base, status: 'pending', batch_id: batch.id, report: null })
  } catch (e) {
    return save({ ...base, status: 'failed', report: null, error: errorText(e) })
  }
}

/** Collect every pending batch that has finished. */
export async function collectBatches() {
  const { data: pending } = await db().from('ai_audit_reports').select('id, model, batch_id, created_at').eq('status', 'pending')
  const out: Array<{ id: string; status: string }> = []
  for (const row of pending ?? []) {
    try {
      const batch = await client().messages.batches.retrieve(row.batch_id)
      if (batch.processing_status !== 'ended') { out.push({ id: row.id, status: batch.processing_status }); continue }
      let update: Record<string, unknown> = { status: 'failed', error: 'The batch ended with no result.' }
      for await (const r of await client().messages.batches.results(row.batch_id)) {
        if (r.result.type === 'succeeded') {
          const m = r.result.message
          update = {
            status: m.stop_reason === 'refusal' ? 'failed' : 'done',
            report: m.stop_reason === 'refusal' ? null : textOf(m.content),
            error: m.stop_reason === 'refusal' ? 'The model declined to write this report.'
              : m.stop_reason === 'max_tokens' ? 'The report was cut off at the length limit.' : null,
            input_tokens: m.usage.input_tokens, output_tokens: m.usage.output_tokens,
            cost_usd: costUsd(row.model, m.usage.input_tokens, m.usage.output_tokens, true),
          }
        } else {
          update = { status: 'failed', error: `Batch request ${r.result.type}${r.result.type === 'errored' ? `: ${r.result.error.error.message}` : ''}` }
        }
      }
      await db().from('ai_audit_reports').update({ ...update, completed_at: new Date().toISOString() }).eq('id', row.id)
      out.push({ id: row.id, status: String(update.status) })
    } catch (e) {
      out.push({ id: row.id, status: `error: ${errorText(e)}` })
    }
  }
  return out
}

function errorText(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'The Anthropic API key is missing or invalid (Vercel → ANTHROPIC_API_KEY).'
  if (e instanceof Anthropic.RateLimitError) return 'Anthropic rate limit or spend limit reached — try again later.'
  if (e instanceof Anthropic.BadRequestError && /workspace/i.test(e.message)) {
    return 'The Anthropic API key is not tied to a workspace. Add ANTHROPIC_WORKSPACE_ID in Vercel (Console → Settings → Workspaces), or use a key created inside a workspace.'
  }
  if (e instanceof Anthropic.APIError) return `Anthropic API error ${e.status ?? ''}: ${e.message}`.trim()
  return e instanceof Error ? e.message : String(e)
}

async function save(row: Record<string, unknown>) {
  const status = (row.status as string) ?? 'done'
  const { data, error } = await db().from('ai_audit_reports')
    .insert({ ...row, status, completed_at: status === 'pending' ? null : new Date().toISOString() }).select('id, agent, status').single()
  if (error) throw new Error(error.message)
  return data as { id: string; agent: Agent; status: string }
}

/** What the scheduled run does on a given Dhaka date. */
export function dueOn(today: string): Agent[] {
  const due: Agent[] = ['daily']
  if (new Date(`${today}T12:00:00Z`).getUTCDay() === 0) due.push('weekly')   // Sunday
  if (today.endsWith('-01')) due.push('monthly')
  return due
}
