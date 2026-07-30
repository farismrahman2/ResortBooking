'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Download, Search, Plus, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  FIELD_VISIT_STATUS_LABELS, FIELD_VISIT_STATUS_BADGE, INTEREST_OPTIONS,
  type FieldVisitListRow,
} from '@/lib/supabase/types-field-visits'
import { formatDate } from '@/lib/formatters/dates'
import type { CrmSector } from '@/lib/supabase/types-crm'
import type { SalesEmployee } from '@/lib/supabase/types'

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
  const today = new Date().toISOString().slice(0, 10)

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

  const exportHref = (() => {
    const p = new URLSearchParams()
    if (f.from) p.set('from', f.from); if (f.to) p.set('to', f.to)
    if (f.exec) p.set('exec', f.exec); if (f.interest) p.set('interest', f.interest)
    if (f.status) p.set('status', f.status); if (f.sector) p.set('sector', f.sector)
    if (f.overdue) p.set('overdue', '1'); if (f.q) p.set('q', f.q)
    return `/api/field-visits/export${p.toString() ? `?${p}` : ''}`
  })()

  const sel = 'min-h-[40px] rounded-lg border border-gray-300 bg-white px-2.5 text-sm focus:border-amber-500 focus:outline-none'

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
        <div className="relative min-w-[180px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search" placeholder="Search organisation…"
            defaultValue={f.q}
            onChange={(e) => apply({ q: e.target.value })}
            className={cn(sel, 'w-full pl-8')}
          />
        </div>
        <input type="date" value={f.from} onChange={(e) => apply({ from: e.target.value })} className={sel} aria-label="From date" />
        <span className="text-xs text-gray-400">→</span>
        <input type="date" value={f.to} onChange={(e) => apply({ to: e.target.value })} className={sel} aria-label="To date" />

        <select value={f.exec} onChange={(e) => apply({ exec: e.target.value })} className={sel} aria-label="Sales rep">
          <option value="">All reps</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
        <select value={f.interest} onChange={(e) => apply({ interest: e.target.value })} className={sel} aria-label="Interest">
          <option value="">Any interest</option>
          {INTEREST_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={f.status} onChange={(e) => apply({ status: e.target.value })} className={sel} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(FIELD_VISIT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={f.sector} onChange={(e) => apply({ sector: e.target.value })} className={sel} aria-label="Sector">
          <option value="">All sectors</option>
          {sectors.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
        </select>

        <button
          type="button"
          onClick={() => apply({ overdue: !f.overdue })}
          className={cn(
            'min-h-[40px] rounded-lg border px-3 text-sm font-medium',
            f.overdue ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-gray-700',
          )}
        >
          Overdue only
        </button>

        <a
          href={exportHref}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700"
        >
          <Download size={14} /> Export CSV
        </a>
      </div>

      {visits.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
          <ClipboardList size={28} className="mx-auto text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-700">No visits logged yet</p>
          <p className="mt-1 text-xs text-gray-500">Log your first visit from a phone while you&apos;re with the client.</p>
          {canWrite && (
            <Link
              href="/crm/field-visits/new"
              className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white"
            >
              <Plus size={16} /> Log your first visit
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 sm:hidden">
            {visits.map((v) => {
              const overdue = !!v.due_by && v.due_by <= today && v.status !== 'processed'
              return (
                <Link key={v.id} href={`/crm/field-visits/${v.id}`} className="block rounded-xl border border-gray-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                      {v.organisation_name ?? <span className="text-gray-400">Untitled visit</span>}
                    </p>
                    <StatusChip status={v.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {v.visit_date ? formatDate(v.visit_date) : '—'} · {v.sales_executive_name ?? '—'}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {v.interest_level && <InterestChip level={v.interest_level} />}
                    {v.due_by && (
                      <span className={cn('text-xs', overdue ? 'font-semibold text-red-600' : 'text-gray-500')}>
                        Due {formatDate(v.due_by)}
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
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
                  return (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <Link href={`/crm/field-visits/${v.id}`} className="font-medium text-gray-900 hover:underline">
                          {v.organisation_name ?? <span className="text-gray-400">Untitled</span>}
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
