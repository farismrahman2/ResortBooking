'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { createMenuDay } from '@/lib/actions/menus'
import { formatDate } from '@/lib/formatters/dates'

interface BookingOption {
  id: string
  booking_number: string
  customer_name: string
  visit_date: string
}

export function NewMenuForm({ bookings }: { bookings: BookingOption[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [bookingId, setBookingId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [occasion, setOccasion] = useState('')
  const [dateTouched, setDateTouched] = useState(false)
  const [occasionTouched, setOccasionTouched] = useState(false)

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
          Picking a booking pre-fills the date, occasion, and guest counts — everything stays editable.
        </p>
      </div>

      <Input
        label="Menu date"
        type="date"
        required
        value={date}
        onChange={(e) => { setDate(e.target.value); setDateTouched(true) }}
      />

      <Input
        label="Occasion note (উপলক্ষ)"
        placeholder="e.g. ডেকাথেলনঃ ৫২ জন"
        value={occasion}
        onChange={(e) => { setOccasion(e.target.value); setOccasionTouched(true) }}
      />

      <div className="flex justify-end">
        <Button onClick={submit} loading={pending} disabled={!date}>
          Create menu
        </Button>
      </div>
    </div>
  )
}
