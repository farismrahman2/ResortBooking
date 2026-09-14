'use client'

import { useState } from 'react'
import { Copy, Check, Download, Loader2 } from 'lucide-react'

type Detail = 'full' | 'summary'
type Range  = 'all' | '12m' | '6m' | '3m'

const RANGES: Array<{ id: Range; label: string; months: number | null }> = [
  { id: 'all', label: 'All time',      months: null },
  { id: '12m', label: 'Last 12 months', months: 12 },
  { id: '6m',  label: 'Last 6 months',  months: 6 },
  { id: '3m',  label: 'Last 3 months',  months: 3 },
]

function rangeDates(range: Range): { from: string; to: string } {
  // A year ahead, so bookings already taken for future dates are included.
  const to = new Date(Date.now() + 365 * 86400_000).toISOString().slice(0, 10)
  const months = RANGES.find((r) => r.id === range)?.months
  if (!months) return { from: '2000-01-01', to }
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return { from: d.toISOString().slice(0, 10), to }
}

function prettySize(bytes: number): string {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`
}

/**
 * Copies the whole business — bookings, revenue, expenses, prices, occupancy —
 * as one JSON document, to paste into an AI chat and talk through.
 */
export function BusinessDataExport() {
  const [range, setRange]   = useState<Range>('all')
  const [detail, setDetail] = useState<Detail>('full')
  const [busy, setBusy]     = useState<'copy' | 'download' | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [size, setSize]     = useState<number | null>(null)

  const href = (download: boolean) => {
    const { from, to } = rangeDates(range)
    const p = new URLSearchParams({ from, to, detail })
    if (download) p.set('download', '1')
    return `/api/exports/business-context?${p.toString()}`
  }

  async function copy() {
    setBusy('copy'); setError(null); setCopied(false)
    try {
      const res = await fetch(href(false))
      if (!res.ok) throw new Error(res.status === 403 ? 'You do not have permission to export reports.' : `Export failed (${res.status})`)
      const text = await res.text()
      setSize(new Blob([text]).size)
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 4000)
    } catch (err) {
      // Clipboard is blocked outside a secure context on some phone browsers —
      // the download still works, so say that rather than just failing.
      setError(err instanceof Error ? err.message : 'Could not copy. Use Download instead.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Every booking, the revenue behind it, expenses, package prices and occupancy — as one JSON
        document. Copy it into an AI chat and ask about weekday offers, pricing or where the money
        goes.
      </p>

      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Period</p>
          <div className="flex flex-wrap gap-1.5">
            {RANGES.map((r) => (
              <button key={r.id} type="button" onClick={() => { setRange(r.id); setSize(null) }}
                className={`inline-flex min-h-[34px] items-center rounded-lg border px-2.5 text-xs font-medium ${
                  range === r.id
                    ? 'border-forest-500 bg-forest-50 text-forest-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Detail</p>
          <div className="flex flex-wrap gap-1.5">
            {([
              { id: 'full',    label: 'Every booking',  hint: 'totals plus one row per booking and expense' },
              { id: 'summary', label: 'Totals only',    hint: 'the aggregates — much smaller to paste' },
            ] as Array<{ id: Detail; label: string; hint: string }>).map((d) => (
              <button key={d.id} type="button" onClick={() => { setDetail(d.id); setSize(null) }}
                title={d.hint}
                className={`inline-flex min-h-[34px] items-center rounded-lg border px-2.5 text-xs font-medium ${
                  detail === d.id
                    ? 'border-forest-500 bg-forest-50 text-forest-800'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} disabled={busy !== null}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-forest-700 px-3 text-xs font-semibold text-white disabled:opacity-60">
          {busy === 'copy' ? <Loader2 size={14} className="animate-spin" /> : copied ? <Check size={14} /> : <Copy size={14} />}
          {busy === 'copy' ? 'Building…' : copied ? 'Copied' : 'Copy JSON'}
        </button>
        <a href={href(true)}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50">
          <Download size={14} /> Download .json
        </a>
        {size !== null && (
          <span className="text-xs text-gray-500">{prettySize(size)} copied</span>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        The file explains itself to the AI — what the numbers mean, how revenue is counted, and what
        capacity the resort has. A good opening question: <em>&quot;Weekdays are quiet. Using this
        data, what offer would fill Monday to Wednesday without cutting weekend prices?&quot;</em>
      </p>
    </div>
  )
}
