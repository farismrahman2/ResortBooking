'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'
import {
  Download, Search, Plus, ClipboardList, SlidersHorizontal, X,
  Flame, AlertTriangle, PencilLine, ChevronRight, CloudOff,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  FIELD_VISIT_STATUS_LABELS, FIELD_VISIT_STATUS_BADGE, INTEREST_OPTIONS,
  type FieldVisitListRow,
} from '@/lib/supabase/types-field-visits'
import { formatDate } from '@/lib/formatters/dates'
import type { CrmSector } from '@/lib/supabase/types-crm'
import type { SalesEmployee } from '@/lib/supabase/types'
import { OfflineSync } from './OfflineSync'

interface Initial {
  from: string; to: string; exec: string; interest: string
  status: string; sector: string; overdue: boolean; q: string
}

export function FieldVisitsClient({
  visits, sectors, employees, canWrite, initial,
}: {
  visits: FieldVisitListRow[]
  sectors: CrmSector[]
  employees: SalesEmployee[]
  canWrite: boolean
  initial: Initial
}) {
  const router = useRouter()
  const [f, setF] = useState<Initial>(initial)
  const [showFilters, setShowFilters] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  // Filters are collapsed by default on mobile — they used to eat most of the
  // first screen before any actual content. The badge keeps them discoverable.
  const activeCount = useMemo(() => {
    let n = 0
    if (f.from || f.to) n++
    if (f.exec) n++
    if (f.interest) n++
    if (f.status) n++
    if (f.sector) n++
    if (f.overdue) n++
    return n
  }, [f])

  const stats = useMemo(() => {
    const hot     = visits.filter((v) => v.interest_level === 'hot').length
    const overdue = visits.filter((v) => v.due_by && v.due_by <= today && v.status !== 'processed').length
    const drafts  = visits.filter((v) => v.status === 'draft').length
    return { total: visits.length, hot, overdue, drafts }
  }, [visits, today])

  function apply(patch: Partial<Initial>) {
    const next = { ...f, ...patch }
    setF(next)
    const p = new URLSearchParams()
    if (next.from)     p.set('from', next.from)
    if (next.to)       p.set('to', next.to)
    if (next.exec)     p.set('exec', next.exec)
    if (next.interest) p.set('interest', next.interest)
    if (next.status)   p.set('status', next.status)
    if (next.sector)   p.set('sector', next.sector)
    if (next.overdue)  p.set('overdue', '1')
    if (next.q)        p.set('q', next.q)
    router.push(`/crm/field-visits${p.toString() ? `?${p}` : ''}`)
  }

  function clearAll() {
    setF({ from: '', to: '', exec: '', interest: '', status: '', sector: '', overdue: false, q: f.q })
    router.push(`/crm/field-visits${f.q ? `?q=${encodeURIComponent(f.q)}` : ''}`)
  }

  const exportHref = (() => {
    const p = new URLSearchParams()
    if (f.from) p.set('from', f.from); if (f.to) p.set('to', f.to)
    if (f.exec) p.set('exec', f.exec); if (f.interest) p.set('interest', f.interest)
    if (f.status) p.set('status', f.status); if (f.sector) p.set('sector', f.sector)
    if (f.overdue) p.set('overdue', '1'); if (f.q) p.set('q', f.q)
    return `/api/field-visits/export${p.toString() ? `?${p}` : ''}`
  })()

  const sel = 'min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:border-amber-500 focus:outline-none'

  return (
    <div className="space-y-4">
      <OfflineSync compact />

      {/* Stat strip — tappable shortcuts, not just decoration */}
      {visits.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            label="Visits" value={stats.total} tone="slate"
            active={!f.interest && !f.overdue}
            onClick={() => apply({ interest: '', overdue: false })}
          />
          <StatTile
            label="Hot" value={stats.hot} tone="red" icon={<Flame size={13} />}
            active={f.interest === 'hot'}
            onClick={() => apply({ interest: f.interest === 'hot' ? '' : 'hot', overdue: false })}
          />
          <StatTile
            label="Overdue" value={stats.overdue} tone="amber" icon={<AlertTriangle size={13} />}
            active={f.overdue}
            onClick={() => apply({ overdue: !f.overdue, interest: '' })}
          />
        </div>
      )}

      {/* Search + filter toggle — one compact row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search" placeholder="Search organisation…"
            defaultValue={f.q}
            onChange={(e) => apply({ q: e.target.value })}
            className="min-h-[44px] w-full rounded-xl border border-gray-300 bg-white pl-9 pr-3 text-sm focus:border-amber-500 focus:outline-none"
          />
        </div>
        <Link
          href="/crm/field-visits/offline"
          aria-label="Offline visits"
          title="Log a visit with no signal"
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700"
        >
          <CloudOff size={15} />
          <span className="hidden sm:inline">Offline</span>
        </Link>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className={cn(
            'relative flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 text-sm font-medium',
            activeCount > 0 || showFilters
              ? 'border-amber-500 bg-amber-50 text-amber-800'
              : 'border-gray-300 bg-white text-gray-700',
          )}
        >
          <SlidersHorizontal size={15} />
          <span className="hidden sm:inline">Filters</span>
          {activeCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-bold text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Collapsed by default */}
      {showFilters && (
        <div className="space-y-2.5 rounded-xl border border-gray-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-gray-500">From</span>
              <input type="date" value={f.from} onChange={(e) => apply({ from: e.target.value })} className={sel} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium text-gray-500">To</span>
              <input type="date" value={f.to} onChange={(e) => apply({ to: e.target.value })} className={sel} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select value={f.exec} onChange={(e) => apply({ exec: e.target.value })} className={sel} aria-label="Sales rep">
              <option value="">All reps</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
            <select value={f.status} onChange={(e) => apply({ status: e.target.value })} className={sel} aria-label="Status">
              <option value="">All statuses</option>
              {Object.entries(FIELD_VISIT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={f.interest} onChange={(e) => apply({ interest: e.target.value })} className={sel} aria-label="Interest">
              <option value="">Any interest</option>
              {INTEREST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={f.sector} onChange={(e) => apply({ sector: e.target.value })} className={sel} aria-label="Sector">
              <option value="">All sectors</option>
              {sectors.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-0.5">
            {activeCount > 0 && (
              <button type="button" onClick={clearAll}
                className="flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-lg border border-gray-300 text-xs font-medium text-gray-600">
                <X size={13} /> Clear filters
              </button>
            )}
            <a href={exportHref}
              className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-700">
              <Download size={13} /> Export CSV
            </a>
          </div>
        </div>
      )}

      {visits.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white px-6 py-14 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
            <ClipboardList size={26} className="text-amber-600" />
          </div>
          <p className="mt-3 text-base font-semibold text-gray-800">
            {activeCount > 0 || f.q ? 'No visits match those filters' : 'No visits logged yet'}
          </p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-gray-500">
            {activeCount > 0 || f.q
              ? 'Try widening the date range or clearing a filter.'
              : 'Log your first visit from your phone while you’re sitting with the client.'}
          </p>
          {activeCount > 0 || f.q ? (
            <button type="button" onClick={clearAll}
              className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-300 px-4 text-sm font-medium text-gray-700">
              <X size={15} /> Clear filters
            </button>
          ) : canWrite && (
            <Link href="/crm/field-visits/new"
              className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-amber-600 px-5 text-sm font-semibold text-white shadow-sm">
              <Plus size={16} /> Log your first visit
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {visits.map((v) => <VisitCard key={v.id} v={v} today={today} />)}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white sm:block">
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Organisation</th>
                  <th className="px-4 py-2.5 font-medium">Rep</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Interest</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Due by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visits.map((v) => {
                  const overdue = !!v.due_by && v.due_by <= today && v.status !== 'processed'
                  const isDraft = v.status === 'draft'
                  return (
                    <tr key={v.id} className={cn('hover:bg-amber-50/40', isDraft && 'bg-gray-50/60')}>
                      <td className="px-4 py-2.5">
                        <Link href={draftHref(v)} className="font-medium text-gray-900 hover:underline">
                          {v.organisation_name ?? <span className="italic text-gray-400">Unfinished draft</span>}
                        </Link>
                        <p className="font-mono text-xs text-gray-400">{v.visit_ref}</p>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{v.sales_executive_name ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{v.visit_date ? formatDate(v.visit_date) : '—'}</td>
                      <td className="px-4 py-2.5">{v.interest_level ? <InterestChip level={v.interest_level} /> : '—'}</td>
                      <td className="px-4 py-2.5"><StatusChip status={v.status} /></td>
                      <td className={cn('px-4 py-2.5', overdue ? 'font-semibold text-red-600' : 'text-gray-600')}>
                        {v.due_by ? formatDate(v.due_by) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

/** Drafts jump straight back into the wizard; everything else opens detail. */
function draftHref(v: FieldVisitListRow) {
  return v.status === 'draft'
    ? `/crm/field-visits/${v.id}/edit/1`
    : `/crm/field-visits/${v.id}`
}

function VisitCard({ v, today }: { v: FieldVisitListRow; today: string }) {
  const overdue = !!v.due_by && v.due_by <= today && v.status !== 'processed'
  const isDraft = v.status === 'draft'

  // An unfinished draft reads as broken if we show "Untitled visit · — · —".
  // Style it as an explicit resume affordance instead.
  if (isDraft) {
    return (
      <Link
        href={draftHref(v)}
        className="flex items-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/60 p-3 active:bg-gray-100"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-gray-400 ring-1 ring-gray-200">
          <PencilLine size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-gray-700">
            {v.organisation_name ?? 'Unfinished visit'}
          </span>
          <span className="block text-xs text-gray-500">Tap to continue where you left off</span>
        </span>
        <ChevronRight size={16} className="flex-shrink-0 text-gray-400" />
      </Link>
    )
  }

  return (
    <Link
      href={draftHref(v)}
      className="block rounded-xl border border-gray-200 bg-white p-3 active:bg-amber-50/50"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
          {v.organisation_name}
        </p>
        <StatusChip status={v.status} />
      </div>
      <p className="mt-0.5 truncate text-xs text-gray-500">
        {v.visit_date ? formatDate(v.visit_date) : '—'}
        {v.sales_executive_name ? ` · ${v.sales_executive_name}` : ''}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        {v.interest_level && <InterestChip level={v.interest_level} />}
        {v.sector_name && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
            {v.sector_name}
          </span>
        )}
        {v.due_by && (
          <span className={cn(
            'inline-flex items-center gap-1 text-xs',
            overdue ? 'font-semibold text-red-600' : 'text-gray-500',
          )}>
            {overdue && <AlertTriangle size={11} />}
            Due {formatDate(v.due_by)}
          </span>
        )}
      </div>
    </Link>
  )
}

function StatTile({
  label, value, tone, icon, active, onClick,
}: {
  label: string; value: number; tone: 'slate' | 'red' | 'amber'
  icon?: React.ReactNode; active: boolean; onClick: () => void
}) {
  const tones = {
    slate: active ? 'border-gray-800 bg-gray-800 text-white'   : 'border-gray-200 bg-white text-gray-700',
    red:   active ? 'border-red-500 bg-red-500 text-white'      : 'border-gray-200 bg-white text-gray-700',
    amber: active ? 'border-amber-500 bg-amber-500 text-white'  : 'border-gray-200 bg-white text-gray-700',
  }[tone]
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      className={cn(
        'flex min-h-[62px] flex-col items-center justify-center rounded-xl border transition-colors motion-reduce:transition-none',
        tones,
      )}
    >
      <span className="text-xl font-bold tabular-nums leading-none">{value}</span>
      <span className={cn('mt-1 flex items-center gap-1 text-[11px] font-medium', active ? 'opacity-90' : 'text-gray-500')}>
        {icon}{label}
      </span>
    </button>
  )
}

function StatusChip({ status }: { status: FieldVisitListRow['status'] }) {
  return (
    <span className={cn('inline-flex flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold', FIELD_VISIT_STATUS_BADGE[status])}>
      {FIELD_VISIT_STATUS_LABELS[status]}
    </span>
  )
}

function InterestChip({ level }: { level: 'hot' | 'warm' | 'cold' }) {
  const o = INTEREST_OPTIONS.find((x) => x.value === level)!
  return <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold', o.tone)}>{o.label}</span>
}
