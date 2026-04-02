'use client'

import { useState, useMemo } from 'react'
import { Search, ArrowUpDown } from 'lucide-react'
import { Tabs } from '@/components/ui/Tabs'
import { BookingTable } from '@/components/bookings/BookingTable'
import type { BookingWithRooms } from '@/lib/supabase/types'

type TabId   = 'all' | 'confirmed' | 'cancelled'
type SortDir = 'asc' | 'desc'

interface BookingsClientProps {
  bookings: BookingWithRooms[]
}

export function BookingsClient({ bookings }: BookingsClientProps) {
  const [activeTab,      setActiveTab]      = useState<TabId>('all')
  const [search,         setSearch]         = useState('')
  const [packageFilter,  setPackageFilter]  = useState('')
  const [sortDir,        setSortDir]        = useState<SortDir>('asc')
  const [dateFrom,       setDateFrom]       = useState('')
  const [dateTo,         setDateTo]         = useState('')

  // Derive unique package names from snapshot
  const packageNames = useMemo(() => {
    const names = new Set(bookings.map((b) => b.package_snapshot?.name).filter(Boolean))
    return Array.from(names).sort() as string[]
  }, [bookings])

  const counts = useMemo(() => {
    const confirmed = bookings.filter((b) => b.status === 'confirmed').length
    const cancelled = bookings.filter((b) => b.status === 'cancelled').length
    return { all: bookings.length, confirmed, cancelled }
  }, [bookings])

  const tabs = [
    { id: 'all',       label: 'All',       count: counts.all },
    { id: 'confirmed', label: 'Confirmed', count: counts.confirmed },
    { id: 'cancelled', label: 'Cancelled', count: counts.cancelled },
  ]

  const filtered = useMemo<BookingWithRooms[]>(() => {
    let list = [...bookings]

    // Tab filter
    if (activeTab !== 'all') list = list.filter((b) => b.status === activeTab)

    // Package filter
    if (packageFilter) list = list.filter((b) => b.package_snapshot?.name === packageFilter)

    // Date range filter
    if (dateFrom) list = list.filter((b) => b.visit_date >= dateFrom)
    if (dateTo)   list = list.filter((b) => b.visit_date <= dateTo)

    // Search
    if (search.trim()) {
      const term = search.trim().toLowerCase()
      list = list.filter(
        (b) =>
          b.customer_name.toLowerCase().includes(term) ||
          b.customer_phone.toLowerCase().includes(term) ||
          b.booking_number.toLowerCase().includes(term),
      )
    }

    // Sort by visit_date
    list.sort((a, b) =>
      sortDir === 'asc'
        ? a.visit_date.localeCompare(b.visit_date)
        : b.visit_date.localeCompare(a.visit_date),
    )

    return list
  }, [bookings, activeTab, packageFilter, dateFrom, dateTo, search, sortDir])

  return (
    <div className="flex flex-col gap-4">
      {/* Tab bar */}
      <Tabs items={tabs} active={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search by name, phone or booking #…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200"
          />
        </div>

        {/* Package filter */}
        {packageNames.length > 0 && (
          <select
            value={packageFilter}
            onChange={(e) => setPackageFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200"
          >
            <option value="">All Packages</option>
            {packageNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        )}

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Filter from date"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200"
          />
          <span className="text-xs text-gray-400">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Filter to date"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(''); setDateTo('') }}
              className="text-xs text-gray-400 hover:text-gray-600 px-1"
              title="Clear date filter"
            >✕</button>
          )}
        </div>

        {/* Date sort toggle */}
        <button
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          title={sortDir === 'asc' ? 'Showing earliest first — click for latest first' : 'Showing latest first — click for earliest first'}
        >
          <ArrowUpDown size={13} className="text-gray-500" />
          {sortDir === 'asc' ? 'Earliest first' : 'Latest first'}
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <BookingTable bookings={filtered} />
      </div>
    </div>
  )
}
