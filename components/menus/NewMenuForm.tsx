'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { createMenuDay, copyMenuDay } from '@/lib/actions/menus'
import { formatDate } from '@/lib/formatters/dates'
import { banglaDate } from '@/lib/menus/bangla-numerals'
import { cn } from '@/lib/utils'

interface BookingOption {
  id: string
  booking_number: string
  customer_name: string
  visit_date: string
}

interface RecentDay {
  id: string
  menu_date: string
  occasion_note: string | null
  meal_count: number
}

interface Props {
  bookings:    BookingOption[]
  recentDays:  RecentDay[]
  defaultDate?: string
}

export function NewMenuForm({ bookings, recentDays, defaultDate }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [mode, setMode] = useState<'new' | 'copy'>('new')
  const [bookingId, setBookingId] = useState('')
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10))
  const [occasion, setOccasion] = useState('')
  const [dateTouched, setDateTouched] = useState(false)
  const [occasionTouched, setOccasionTouched] = useState(false)
  const [copySourceId, setCopySourceId] = useState('')

  function onPickBooking(id: string) {
    setBookingId(id)
    const b = bookings.find((x) => x.id === id)
    if (b) {
      // Pre-fill date + occasion from the booking; still editable
      if (!dateTouched) setDate(b.visit_date)
      if (!occasionTouched) setOccasion(b.customer_name)
    }
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      if (mode === 'copy') {
        if (!copySourceId) { setError('Pick a menu day to copy'); return }
        const res = await copyMenuDay(copySourceId, date)
        if (!res.success) { setError(res.error); return }
        router.push(`/menus/${res.data.id}?copied=1`)
        return
      }
      const res = await createMenuDay({
        menu_date:     date,
        occasion_note: occasion.trim() || null,
        booking_id:    bookingId || null,
      })
      if (!res.success) { setError(res.error); return }
      router.push(`/menus/${res.data.id}`)
    })
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Mode toggle */}
      <div className="flex gap-2">
        <ModeChip active={mode === 'new'} onClick={() => setMode('new')}>Blank / from booking</ModeChip>
        <ModeChip active={mode === 'copy'} onClick={() => setMode('copy')} disabled={recentDays.length === 0}>
          <Copy size={13} className="mr-1 inline" /> Copy an existing day
        </ModeChip>
      </div>

      {mode === 'new' && (
        <div>
          <label className="field-label">From booking (optional)</label>
          <select
            value={bookingId}
            onChange={(e) => onPickBooking(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
          >
            <option value="">— Standalone (no booking) —</option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {formatDate(b.visit_date)} · {b.customer_name} · {b.booking_number}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Picking a booking pre-fills the date and occasion. Meal headcounts always come from
            ALL bookings on the menu date (arrivals, in-house, checkouts) — everything stays editable.
          </p>
        </div>
      )}

      {mode === 'copy' && (
        <div>
          <label className="field-label">Copy from</label>
          <select
            value={copySourceId}
            onChange={(e) => setCopySourceId(e.target.value)}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200"
          >
            <option value="">— Pick a menu day —</option>
            {recentDays.map((d) => (
              <option key={d.id} value={d.id}>
                {banglaDate(d.menu_date)} · {d.occasion_note || 'no occasion'} · {d.meal_count} meals
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Everything duplicates (meals, dishes, notes, headcounts) as a new draft. The booking link is not copied —
            review the headcounts before finalizing.
          </p>
        </div>
      )}

      <Input
        label={mode === 'copy' ? 'New menu date' : 'Menu date'}
        type="date"
        required
        value={date}
        onChange={(e) => { setDate(e.target.value); setDateTouched(true) }}
      />

      {mode === 'new' && (
        <Input
          label="Occasion note (উপলক্ষ)"
          placeholder="e.g. ডেকাথেলনঃ ৫২ জন"
          value={occasion}
          onChange={(e) => { setOccasion(e.target.value); setOccasionTouched(true) }}
        />
      )}

      <div className="flex justify-end">
        <Button onClick={submit} loading={pending} disabled={!date || (mode === 'copy' && !copySourceId)}>
          {mode === 'copy' ? 'Copy menu' : 'Create menu'}
        </Button>
      </div>
    </div>
  )
}

function ModeChip({ active, disabled, onClick, children }: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-full border px-3.5 py-2 text-xs font-medium transition-colors disabled:opacity-40',
        active ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50',
      )}
    >
      {children}
    </button>
  )
}
