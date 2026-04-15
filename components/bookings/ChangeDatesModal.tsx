'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatBDT } from '@/lib/formatters/currency'
import { confirmDateChange } from '@/lib/actions/bookings'
import type { BookingWithRooms, RoomType } from '@/lib/supabase/types'

const ROOM_LABELS: Record<RoomType, string> = {
  cottage:        'Cottage',
  eco_deluxe:     'Eco Deluxe',
  deluxe:         'Deluxe',
  premium_deluxe: 'Premium Deluxe',
  premium:        'Premium',
  super_premium:  'Super Premium',
  tree_house:     'Tree House',
}

interface ChangeDatesModalProps {
  open:         boolean
  onClose:      () => void
  booking:      BookingWithRooms
  holidayDates: string[]
}

interface PreviewResult {
  available:                boolean
  conflict_message:         string | null
  conflicting_room_numbers: Record<string, string[]>
  old_total:                number
  new_total:                number
  new_subtotal:             number
  new_discount:             number
  new_remaining:            number
  rate_used:                string
  nights:                   number | null
  advance_paid:             number
}

export function ChangeDatesModal({ open, onClose, booking, holidayDates }: ChangeDatesModalProps) {
  const router  = useRouter()
  const isNight = booking.package_type === 'night'

  const [visitDate,    setVisitDate]    = useState(booking.visit_date)
  const [checkOutDate, setCheckOutDate] = useState(booking.check_out_date ?? '')
  const [preview,      setPreview]      = useState<PreviewResult | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const datesChanged = visitDate !== booking.visit_date || (isNight && checkOutDate !== (booking.check_out_date ?? ''))

  // Compute nights for display
  const computedNights = isNight && visitDate && checkOutDate
    ? Math.max(1, Math.round((new Date(checkOutDate + 'T00:00:00').getTime() - new Date(visitDate + 'T00:00:00').getTime()) / 86400000))
    : null

  // Fetch preview when dates change
  const fetchPreview = useCallback(async () => {
    if (!datesChanged) { setPreview(null); return }
    if (!visitDate) return
    if (isNight && !checkOutDate) return
    if (isNight && checkOutDate <= visitDate) { setPreview(null); return }

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        bookingId: booking.id,
        visitDate,
      })
      if (isNight && checkOutDate) params.set('checkOutDate', checkOutDate)

      const res = await fetch(`/api/date-change-preview?${params}`)
      if (!res.ok) throw new Error('Failed to fetch preview')
      const data = await res.json()
      setPreview(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [booking.id, visitDate, checkOutDate, isNight, datesChanged])

  useEffect(() => {
    const timeout = setTimeout(fetchPreview, 400)
    return () => clearTimeout(timeout)
  }, [fetchPreview])

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setVisitDate(booking.visit_date)
      setCheckOutDate(booking.check_out_date ?? '')
      setPreview(null)
      setError(null)
    }
  }, [open, booking.visit_date, booking.check_out_date])

  async function handleConfirm() {
    if (!preview?.available) return
    setSaving(true)
    setError(null)
    try {
      // Build cleared room numbers: remove conflicting ones
      const clearedRoomNumbers: Record<string, string[]> = {}
      for (const r of booking.rooms) {
        const conflicts = preview.conflicting_room_numbers[r.room_type] ?? []
        clearedRoomNumbers[r.room_type] = (r.room_numbers ?? []).filter((n) => !conflicts.includes(n))
      }

      const result = await confirmDateChange(booking.id, {
        new_visit_date:     visitDate,
        new_check_out_date: isNight ? checkOutDate : null,
        cleared_room_numbers: clearedRoomNumbers,
      })

      if (!result.success) {
        setError(result.error ?? 'Failed to change dates')
      } else {
        onClose()
        router.refresh()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const pricingChanged = preview && preview.new_total !== preview.old_total
  const hasConflictingRooms = preview && Object.keys(preview.conflicting_room_numbers).length > 0

  return (
    <Modal open={open} onClose={onClose} title="Change Booking Dates" size="lg">
      <div className="space-y-5">

        {/* Current dates */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Current Dates</p>
          <div className="flex items-center gap-3 text-sm text-gray-700">
            <CalendarDays size={15} className="text-gray-400" />
            <span className="font-medium">{booking.visit_date}</span>
            {isNight && booking.check_out_date && (
              <>
                <span className="text-gray-400">→</span>
                <span className="font-medium">{booking.check_out_date}</span>
                <span className="text-xs text-gray-500">({booking.nights} night{(booking.nights ?? 0) !== 1 ? 's' : ''})</span>
              </>
            )}
          </div>
        </div>

        {/* New date pickers */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">New Dates</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {isNight ? 'New Check-in' : 'New Visit Date'}
              </label>
              <input
                type="date"
                value={visitDate}
                onChange={(e) => setVisitDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
              />
            </div>
            {isNight && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New Check-out</label>
                <input
                  type="date"
                  value={checkOutDate}
                  min={visitDate}
                  onChange={(e) => setCheckOutDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500"
                />
              </div>
            )}
          </div>
          {computedNights !== null && (
            <p className="mt-1.5 text-xs text-gray-500">
              {computedNights} night{computedNights !== 1 ? 's' : ''}
              {computedNights !== (booking.nights ?? 0) && (
                <span className="ml-1 text-amber-600 font-medium">
                  (was {booking.nights} night{(booking.nights ?? 0) !== 1 ? 's' : ''})
                </span>
              )}
            </p>
          )}
        </div>

        {/* Loading spinner */}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" />
            Checking availability...
          </div>
        )}

        {/* Preview results */}
        {!loading && preview && (
          <div className="space-y-3">
            {/* Availability status */}
            {preview.available ? (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-700">
                <CheckCircle2 size={16} />
                <span className="font-medium">Rooms available on the new dates</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{preview.conflict_message}</span>
              </div>
            )}

            {/* Room number conflicts */}
            {hasConflictingRooms && preview.available && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                <div className="flex items-center gap-2 mb-1.5">
                  <AlertTriangle size={15} />
                  <span className="font-semibold">Room numbers will be unassigned</span>
                </div>
                <ul className="ml-5 space-y-0.5 text-xs">
                  {Object.entries(preview.conflicting_room_numbers).map(([type, nums]) => (
                    <li key={type}>
                      {ROOM_LABELS[type as RoomType] ?? type}: Room{nums.length > 1 ? 's' : ''}{' '}
                      <span className="font-mono font-semibold">#{nums.join(', #')}</span>
                      {' '}taken on new dates
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Pricing change warning */}
            {pricingChanged && preview.available && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
                <p className="font-semibold text-blue-800 mb-1.5">Pricing will change</p>
                <div className="space-y-1 text-xs text-blue-700">
                  <div className="flex justify-between">
                    <span>Old total</span>
                    <span className="font-mono">{formatBDT(preview.old_total)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>New total</span>
                    <span className="font-mono">{formatBDT(preview.new_total)}</span>
                  </div>
                  <div className="flex justify-between border-t border-blue-200 pt-1">
                    <span>Difference</span>
                    <span className={`font-mono font-bold ${preview.new_total > preview.old_total ? 'text-red-600' : 'text-green-600'}`}>
                      {preview.new_total > preview.old_total ? '+' : ''}{formatBDT(preview.new_total - preview.old_total)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-0.5">
                    <span>Rate applied</span>
                    <span className="capitalize font-medium">{preview.rate_used}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Advance paid (carries over)</span>
                    <span className="font-mono">{formatBDT(preview.advance_paid)}</span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>New remaining</span>
                    <span className={`font-mono ${preview.new_remaining > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {preview.new_remaining > 0 ? formatBDT(preview.new_remaining) : 'Fully Paid'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* No pricing change */}
            {!pricingChanged && preview.available && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
                Pricing unchanged at <span className="font-mono font-semibold">{formatBDT(preview.old_total)}</span>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            onClick={handleConfirm}
            disabled={!datesChanged || loading || !preview?.available}
          >
            Confirm Date Change
          </Button>
        </div>
      </div>
    </Modal>
  )
}
