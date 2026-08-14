'use client'

import { useEffect, useState } from 'react'
import { Users, Loader2 } from 'lucide-react'
import { getDayPax, type DayPax } from '@/lib/actions/kitchen'
import { safeCall } from '@/lib/actions/safe-call'

/**
 * How many people the kitchen is cooking for on the chosen day.
 *
 * This was the module's biggest blind spot. The requisition asked "what do you
 * want" and never "for how many" — so the person filling it worked from
 * memory of who was checking in, and the only correction came from the
 * kitchen running short. The numbers are already derived from live bookings
 * by the menus module, using the same meal engine as the daily report, so
 * showing them here costs one query and cannot disagree with the menu.
 *
 * Refetched on every date change rather than rendered server-side: the date
 * is the first thing typed and the last thing changed, and a full server
 * round-trip per keystroke on the date input is exactly the sluggishness this
 * pass is meant to remove.
 */
export function PaxBanner({ date }: { date: string }) {
  const [pax, setPax] = useState<DayPax | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setPax(null); return }
    let cancelled = false
    setLoading(true)
    void (async () => {
      const r = await safeCall(() => getDayPax(date))
      if (cancelled) return
      setPax(r.success ? r.data : null)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [date])

  if (!date) return null

  if (loading && !pax) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-500">
        <Loader2 size={14} className="animate-spin" /> Checking who&apos;s on site…
      </div>
    )
  }

  if (!pax || pax.peak === 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
        <Users size={15} className="mt-0.5 flex-shrink-0 text-gray-400" />
        <p className="text-sm text-gray-600">
          <strong className="text-gray-800">No bookings on this date.</strong>{' '}
          Double-check the day before ordering — or carry on if this is for staff or stock.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-forest-200 bg-forest-50/60 px-3 py-2.5">
      <p className="flex items-center gap-2 text-sm font-semibold text-forest-900">
        <Users size={15} className="flex-shrink-0" />
        {pax.peak} people at the busiest meal
        <span className="font-normal text-forest-700">
          · {pax.bookings} booking{pax.bookings === 1 ? '' : 's'}
        </span>
      </p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        {pax.meals.map((m) => (
          <span key={m.label} className="text-xs text-forest-800">
            {m.label} <strong>{m.total}</strong>
          </span>
        ))}
      </div>
    </div>
  )
}
