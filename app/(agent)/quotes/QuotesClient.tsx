'use client'

import { useState, useMemo } from 'react'
import { Search, Building2 } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Tabs } from '@/components/ui/Tabs'
import { QuoteTable } from '@/components/quotes/QuoteTable'
import type { QuoteRow, BookingStatus } from '@/lib/supabase/types'

type TabId = 'all' | BookingStatus

interface QuotesClientProps {
  quotes:       QuoteRow[]
  statusCounts: Record<BookingStatus, number>
}

export function QuotesClient({ quotes, statusCounts }: QuotesClientProps) {
  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [search, setSearch]       = useState('')
  const [corporateOnly, setCorporateOnly] = useState(false)

  const totalCount = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  const tabs = [
    { id: 'all',       label: 'All',       count: totalCount },
    { id: 'draft',     label: 'Draft',     count: statusCounts.draft },
    { id: 'sent',      label: 'Sent',      count: statusCounts.sent },
    { id: 'confirmed', label: 'Confirmed', count: statusCounts.confirmed },
    { id: 'cancelled', label: 'Cancelled', count: statusCounts.cancelled },
  ]

  const filtered = useMemo<QuoteRow[]>(() => {
    let list = quotes

    // Tab filter
    if (activeTab !== 'all') {
      list = list.filter((q) => q.status === activeTab)
    }

    // Corporate-only filter
    if (corporateOnly) list = list.filter((q) => (q as any).is_corporate === true)

    // Search filter (customer name, phone, or quote number)
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      list = list.filter(
        (q) =>
          q.customer_name.toLowerCase().includes(term) ||
          q.customer_phone.toLowerCase().includes(term) ||
          q.quote_number.toLowerCase().includes(term),
      )
    }

    return list
  }, [quotes, activeTab, search, corporateOnly])

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <Tabs
        items={tabs}
        active={activeTab}
        onChange={(id) => setActiveTab(id as TabId)}
      />

      {/* Search + Corporate filter */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="search"
            placeholder="Search by name, phone or quote #…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200"
          />
        </div>
        <button
          onClick={() => setCorporateOnly((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            corporateOnly
              ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
              : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
          }`}
          title={corporateOnly ? 'Showing corporate quotes only — click to clear' : 'Show corporate quotes only'}
        >
          <Building2 size={13} className={corporateOnly ? 'text-indigo-600' : 'text-gray-500'} />
          Corporate only
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <QuoteTable quotes={filtered} />
      </div>
    </div>
  )
}
