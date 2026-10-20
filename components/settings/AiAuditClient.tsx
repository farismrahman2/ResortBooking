'use client'

import { Fragment, useState, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bot, RefreshCw, AlertTriangle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react'
import { runAiAudit, refreshAiAudit } from '@/lib/actions/ai-audit'
import { toast } from '@/lib/toast/store'
import type { AuditReportRow } from '@/lib/queries/ai-audit'
import type { AuditArea, Finding } from '@/lib/audit/types'

const AREAS: Array<{ key: AuditArea; label: string }> = [
  { key: 'bookings', label: 'Bookings & money' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'inventory', label: 'Inventory & kitchen' },
]
const SEV = {
  high:   'bg-red-50 text-red-700 ring-red-200',
  medium: 'bg-amber-50 text-amber-800 ring-amber-200',
  low:    'bg-gray-50 text-gray-600 ring-gray-200',
} as const
const AGENT_LABEL = { daily: 'Daily check', weekly: 'Weekly operations & cost report', monthly: 'Monthly business report' } as const

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const day  = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const taka = (n: number) => `৳${Math.round(n).toLocaleString('en-IN')}`
const usd  = (n: number) => `US$${n < 0.01 && n > 0 ? n.toFixed(4) : n.toFixed(2)}`

export function AiAuditClient({ reports, monthSpend, keySet }: { reports: AuditReportRow[]; monthSpend: number; keySet: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const latest = reports.find((r) => r.agent === 'daily')
  const periodic = reports.filter((r) => r.agent !== 'daily')
  const dailyHistory = reports.filter((r) => r.agent === 'daily').slice(0, 14)
  const waiting = periodic.some((r) => r.status === 'pending')
  const findings = latest?.findings ?? []

  function run(label: string, fn: () => Promise<{ success: boolean; error?: string }>, done: string) {
    setBusy(label)
    start(async () => {
      const r = await fn()
      setBusy(null)
      if (!r.success) { toast.error(r.error ?? 'Failed'); return }
      toast.success(done)
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {!keySet && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ANTHROPIC_API_KEY is not set in Vercel, so only the free rule checks can run.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Issues found today" value={String(findings.length)}
          note={findings.length ? `${findings.filter((f) => f.severity === 'high').length} urgent` : latest ? 'All checks passed' : 'Not run yet'} />
        <Stat label="AI spend this month" value={usd(monthSpend)} note="Expected about US$1–1.50 a month" />
        <Stat label="Schedule" value="Every morning" note="7:10 am check · Sundays weekly report · 1st monthly report" />
      </div>

      <div className="flex flex-wrap gap-2">
        <RunButton busy={busy === 'daily' && pending} disabled={pending} onClick={() => run('daily', () => runAiAudit('daily'), 'Daily check done')}>Run daily check now</RunButton>
        <RunButton busy={busy === 'weekly' && pending} disabled={pending || !keySet} onClick={() => run('weekly', () => runAiAudit('weekly'), 'Weekly report requested — usually ready within an hour')}>Write weekly report</RunButton>
        <RunButton busy={busy === 'monthly' && pending} disabled={pending || !keySet} onClick={() => run('monthly', () => runAiAudit('monthly'), 'Monthly report requested — usually ready within an hour')}>Write monthly report</RunButton>
        {waiting && (
          <button type="button" disabled={pending} onClick={() => run('refresh', refreshAiAudit, 'Checked for finished reports')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={14} className={busy === 'refresh' && pending ? 'animate-spin' : ''} /> Check for finished reports
          </button>
        )}
      </div>

      {/* ── Today ── */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <header className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
          <Bot size={16} className="text-forest-700" />
          <h2 className="text-sm font-semibold text-gray-900">Top things to fix today</h2>
          {latest && <span className="ml-auto text-xs text-gray-400">{when(latest.created_at)}</span>}
        </header>
        <div className="px-4 py-3">
          {!latest ? <p className="text-sm text-gray-500">No check has run yet — press “Run daily check now”.</p> : (
            <>
              {latest.error && <ErrorNote text={latest.error} />}
              {latest.report ? <Markdown text={latest.report} /> : !latest.error && <p className="text-sm text-gray-500">No summary.</p>}
            </>
          )}
        </div>
      </section>

      {findings.length > 0 && (
        <section className="space-y-3">
          {AREAS.map((a) => {
            const list = findings.filter((f) => f.area === a.key)
            return (
              <div key={a.key} className="rounded-xl border border-gray-200 bg-white">
                <header className="flex items-center border-b border-gray-100 px-4 py-2.5">
                  <h3 className="text-sm font-semibold text-gray-800">{a.label}</h3>
                  <span className="ml-auto text-xs text-gray-400">{list.length ? `${list.length} issue${list.length === 1 ? '' : 's'}` : 'All clear'}</span>
                </header>
                {list.map((f) => <FindingRow key={f.id} f={f} />)}
              </div>
            )
          })}
        </section>
      )}

      {/* ── Weekly & monthly reports ── */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <header className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Weekly and monthly reports</h2>
        </header>
        {periodic.length === 0 ? <p className="px-4 py-3 text-sm text-gray-500">None yet. The first weekly report is written on Sunday.</p>
          : periodic.map((r, i) => <ReportRow key={r.id} r={r} open={i === 0} />)}
      </section>

      {dailyHistory.length > 1 && (
        <section className="rounded-xl border border-gray-200 bg-white">
          <header className="border-b border-gray-100 px-4 py-3"><h2 className="text-sm font-semibold text-gray-900">Recent daily checks</h2></header>
          <table className="w-full text-sm">
            <tbody>
              {dailyHistory.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 first:border-t-0">
                  <td className="px-4 py-2 text-gray-700">{when(r.created_at)}</td>
                  <td className="px-4 py-2 text-gray-600">{r.findings.length} issue{r.findings.length === 1 ? '' : 's'} · {r.findings.filter((f) => f.severity === 'high').length} urgent</td>
                  <td className="px-4 py-2 text-right text-xs text-gray-400">{r.triggered_by === 'manual' ? 'run by hand' : 'scheduled'} · {usd(r.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-gray-900">{value}</div>
      <div className="mt-0.5 text-xs text-gray-400">{note}</div>
    </div>
  )
}

function RunButton({ children, busy, disabled, onClick }: { children: ReactNode; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg bg-forest-700 px-3 py-2 text-sm font-medium text-white hover:bg-forest-800 disabled:opacity-50">
      {busy && <RefreshCw size={14} className="animate-spin" />} {children}
    </button>
  )
}

function ErrorNote({ text }: { text: string }) {
  return (
    <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
      <AlertTriangle size={13} className="mt-0.5 shrink-0" /> <span className="whitespace-pre-line">{text}</span>
    </p>
  )
}

function FindingRow({ f }: { f: Finding }) {
  const [open, setOpen] = useState(f.severity === 'high')
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-2 px-4 py-2.5 text-left hover:bg-gray-50">
        {open ? <ChevronDown size={15} className="mt-0.5 shrink-0 text-gray-400" /> : <ChevronRight size={15} className="mt-0.5 shrink-0 text-gray-400" />}
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ring-1 ${SEV[f.severity]}`}>{f.severity}</span>
        <span className="flex-1 text-sm text-gray-800">{f.title}</span>
        <span className="shrink-0 text-xs text-gray-500">{f.count}{f.amount ? ` · ${taka(f.amount)}` : ''}</span>
      </button>
      {open && (
        <ul className="space-y-1 px-4 pb-3 pl-11">
          {f.examples.map((e, i) => (
            <li key={i} className="flex items-baseline gap-2 text-xs">
              {e.link ? (
                <Link href={e.link} className="inline-flex items-center gap-1 font-medium text-forest-700 hover:underline">
                  {e.ref} <ExternalLink size={10} />
                </Link>
              ) : <span className="font-medium text-gray-700">{e.ref}</span>}
              <span className="text-gray-500">{e.detail}</span>
            </li>
          ))}
          {f.count > f.examples.length && <li className="text-xs text-gray-400">…and {f.count - f.examples.length} more</li>}
        </ul>
      )}
    </div>
  )
}

function ReportRow({ r, open: initial }: { r: AuditReportRow; open: boolean }) {
  const [open, setOpen] = useState(initial && r.status === 'done')
  return (
    <div className="border-t border-gray-100 first:border-t-0">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-gray-50">
        {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
        <span className="text-sm font-medium text-gray-800">{AGENT_LABEL[r.agent]}</span>
        <span className="text-xs text-gray-500">{day(r.period_start)} – {day(r.period_end)}</span>
        <span className="ml-auto text-xs text-gray-400">
          {r.status === 'pending' ? 'Being written…' : r.status === 'failed' ? 'Failed' : `${when(r.completed_at ?? r.created_at)} · ${usd(r.cost_usd)}`}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 pl-10">
          {r.error && <ErrorNote text={r.error} />}
          {r.report ? <Markdown text={r.report} /> : r.status === 'pending' && <p className="text-sm text-gray-500">Usually ready within an hour — the page checks every morning, or press “Check for finished reports”.</p>}
        </div>
      )}
    </div>
  )
}

/** The handful of Markdown the reports use — headings, lists, bold — drawn as
 *  React elements (never as raw HTML). */
function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(<Tag key={blocks.length} className={`${list.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}>{list.items.map((t, i) => <li key={i}>{inline(t)}</li>)}</Tag>)
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line), ul = /^\s*[-*•]\s+(.*)$/.exec(line), h = /^(#{1,4})\s+(.*)$/.exec(line)
    if (ol || ul) {
      const ordered = !!ol
      if (list && list.ordered !== ordered) flush()
      if (!list) list = { ordered, items: [] }
      list.items.push((ol ?? ul)![1])
      continue
    }
    flush()
    if (h) blocks.push(<h4 key={blocks.length} className="mt-3 text-sm font-semibold text-gray-900 first:mt-0">{inline(h[2])}</h4>)
    else if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>)
  }
  flush()
  return <div className="space-y-2 text-sm leading-relaxed text-gray-700">{blocks}</div>
}

function inline(t: string): ReactNode {
  return t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i} className="text-gray-900">{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>)
}
