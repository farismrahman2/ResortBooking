'use client'

import { useState, useEffect, useCallback } from 'react'
import { formatBDT } from '@/lib/formatters/currency'

type PackageFilter = 'all' | 'daylong' | 'night'

interface RevenueStats {
  booking_count:  number
  total_revenue:  number
  collected:      number
  outstanding:    number
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoISO(n: number) {
  return new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10)
}

export function RevenueWidget() {
  const [from,   setFrom]   = useState(daysAgoISO(30))
  const [to,     setTo]     = useState(todayISO())
  const [type,   setType]   = useState<PackageFilter>('all')
  const [stats,  setStats]  = useState<RevenueStats | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchStats = useCallback(async () => {
    if (!from || !to) return
    setLoading(true)
    try {
      const res = await fetch(`/api/revenue?from=${from}&to=${to}&type=${type}`)
      const data = await res.json()
      setStats(data)
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [from, to, type])

  useEffect(() => { fetchStats() }, [fetchStats])

  const presets = [
    { label: 'Last 7d',  from: daysAgoISO(7),  to: todayISO() },
    { label: 'Last 30d', from: daysAgoISO(30), to: todayISO() },
    { label: 'Last 90d', from: daysAgoISO(90), to: todayISO() },
  ]

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900">Revenue</h3>
        {loading && <span className="text-xs text-gray-400 animate-pulse">Loading…</span>}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        {/* Quick presets */}
        <div className="flex gap-1.5 flex-wrap">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => { setFrom(p.from); setTo(p.to) }}
              className={[
                'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                from === p.from && to === p.to
                  ? 'border-forest-500 bg-forest-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-forest-400 hover:text-forest-700',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-forest-500"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-forest-500"
          />
        </div>

        {/* Package type filter */}
        <div className="flex gap-1.5">
          {(['all', 'daylong', 'night'] as PackageFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={[
                'rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                type === t
                  ? 'border-forest-500 bg-forest-600 text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-forest-400 hover:text-forest-700',
              ].join(' ')}
            >
              {t === 'all' ? 'All' : t === 'daylong' ? 'Daylong' : 'Night Stay'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats grid */}
      {stats && (
        <div className="grid grid-cols-2 gap-3">
          <StatBox label="Total Revenue"  value={formatBDT(stats.total_revenue)} accent />
          <StatBox label="Bookings"       value={String(stats.booking_count)} />
          <StatBox label="Collected"      value={formatBDT(stats.collected)} green />
          <StatBox label="Outstanding"    value={formatBDT(stats.outstanding)} red={stats.outstanding > 0} />
        </div>
      )}

      {stats && stats.booking_count === 0 && (
        <p className="text-center text-sm text-gray-400 py-2">No bookings in this period</p>
      )}
    </div>
  )
}

function StatBox({
  label,
  value,
  accent,
  green,
  red,
}: {
  label: string
  value: string
  accent?: boolean
  green?: boolean
  red?: boolean
}) {
  return (
    <div className={[
      'rounded-lg border p-3',
      accent ? 'border-forest-200 bg-forest-50' : 'border-gray-100 bg-gray-50',
    ].join(' ')}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className={[
        'text-base font-bold tabular-nums',
        accent ? 'text-forest-800' : green ? 'text-green-700' : red ? 'text-red-600' : 'text-gray-800',
      ].join(' ')}>
        {value}
      </p>
    </div>
  )
}
