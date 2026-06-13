'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { Calendar, Download, ShieldCheck } from 'lucide-react'

type Preset = '12m' | '24m' | 'all' | 'custom'

const PRESET_LABELS: Record<Preset, string> = {
  '12m':    'Last 12 months',
  '24m':    'Last 24 months',
  'all':    'All time',
  'custom': 'Custom range',
}

function todayIso(): string {
  // Asia/Dhaka-ish: just take local date.
  return new Date().toISOString().slice(0, 10)
}

function shiftMonths(iso: string, months: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

export function DataExportClient() {
  const today = todayIso()
  const [preset, setPreset] = useState<Preset>('12m')
  const [customFrom, setCustomFrom] = useState(shiftMonths(today, -12))
  const [customTo, setCustomTo] = useState(today)

  // Resolve preset → actual {from, to}. "All time" uses 2020-01-01 as a
  // reasonable lower bound (the property predates this PMS by a lot, but
  // there's no booking data older than the build).
  const { from, to } = useMemo(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo }
    if (preset === 'all')    return { from: '2020-01-01', to: today }
    if (preset === '24m')    return { from: shiftMonths(today, -24), to: today }
    return { from: shiftMonths(today, -12), to: today }
  }, [preset, customFrom, customTo, today])

  const params = `from=${from}&to=${to}`
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to

  return (
    <div className="space-y-5">
      {/* Date range */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Calendar size={14} /> Date range
        </div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PRESET_LABELS) as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-full px-3 py-1 text-sm transition-colors ${
                preset === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs text-gray-500">
              From
              <input
                type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                className="mt-1 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-forest-600 focus:outline-none"
              />
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              To
              <input
                type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                className="mt-1 rounded-lg border border-gray-300 px-2 py-1 text-sm focus:border-forest-600 focus:outline-none"
              />
            </label>
          </div>
        )}
        <p className="text-xs text-gray-500">
          Bookings filter on the date they were created. Expenses filter on the expense date.
          Range: <span className="font-mono">{from}</span> → <span className="font-mono">{to}</span>
        </p>
      </div>

      {/* Download */}
      <div className="grid gap-3 sm:grid-cols-2">
        <DownloadCard
          title="Bookings CSV"
          subtitle="One row per booking — timing, guests, money, outcome"
          href={`/api/data-export/bookings?${params}`}
          filename={`bookings_${from}_to_${to}.csv`}
          disabled={!valid}
          rows={[
            'Excludes draft and sent bookings',
            'PII sanitized: customer_name dropped, customer_phone hashed → stable guest_id',
            'Includes net_revenue (mirrors dashboard accounting: no-show advance kept, cancelled excluded)',
            'Lead time, day of week, holiday flag, package, room composition, sales rep',
          ]}
        />
        <DownloadCard
          title="Expenses CSV"
          subtitle="One row per expense — for profit / loss analysis"
          href={`/api/data-export/expenses?${params}`}
          filename={`expenses_${from}_to_${to}.csv`}
          disabled={!valid}
          rows={[
            'Excludes drafts',
            'Category slug + group, payee, payment method, source module',
            'Payee names and free-text notes are NOT sanitized — review before sharing with third parties',
          ]}
        />
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <ShieldCheck size={14} className="mt-0.5 flex-shrink-0" />
        <span>
          Admin only. Files contain operational data — handle accordingly when feeding to external AI services.
          Guest IDs are deterministic SHA-256 prefixes, so the same guest gets the same ID across exports,
          but the underlying phone numbers cannot be recovered from them.
        </span>
      </div>
    </div>
  )
}

function DownloadCard({
  title, subtitle, href, filename, disabled, rows,
}: {
  title: string; subtitle: string; href: string; filename: string; disabled: boolean; rows: string[]
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <ul className="space-y-1 text-xs text-gray-600">
        {rows.map((r, i) => <li key={i}>• {r}</li>)}
      </ul>
      <a
        href={disabled ? undefined : href}
        download={filename}
        className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          disabled
            ? 'cursor-not-allowed bg-gray-100 text-gray-400'
            : 'bg-gray-900 text-white hover:bg-gray-700'
        }`}
        onClick={(e) => { if (disabled) e.preventDefault() }}
      >
        <Download size={14} /> Download
      </a>
    </div>
  )
}

// Keep Button import used (for tree-shaking guards in some setups)
void Button
