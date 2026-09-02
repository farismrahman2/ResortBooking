'use client'

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Copy, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { NumberInput } from '@/components/ui/NumberInput'
import { Input } from '@/components/ui/Input'
import { RoomSelector } from '@/components/quotes/RoomSelector'
import { GuestInputs, type GuestValues } from '@/components/quotes/GuestInputs'
import { addDaysIso } from '@/lib/dates'
import { formatBDT } from '@/lib/formatters/currency'
import {
  sortSegments, distinctDates, presenceByDate, roomNumbersOnDate, shortDayLabel,
  type GroupSegment, type GroupSegmentRoom, type StayKind,
} from '@/lib/bookings/group-itinerary'
import type { RoomSelection } from '@/lib/engine/calculator'
import type { PackageWithPrices, RoomInventoryRow } from '@/lib/supabase/types'

interface Props {
  value:        GroupSegment[]
  onChange:     (segments: GroupSegment[]) => void
  rooms:        RoomInventoryRow[]
  nightPackage: PackageWithPrices | null
  dayPackage:   PackageWithPrices | null
  /** Booking being edited — its own rooms must not read as taken. */
  excludeBookingId?: string
  error?: string | null
}

const blankSegment = (day_date: string, stay_kind: StayKind): GroupSegment => ({
  day_date, stay_kind, adults: stay_kind === 'night' ? 2 : 10, adults_comp: 0,
  children_paid: 0, children_free: 0, drivers: 0, extra_beds: 0, rooms: [], notes: null,
})

/**
 * The per-day itinerary behind a group quote.
 *
 * One card per date. Each card has an OVERNIGHT block (rooms slept in that
 * night, and who sleeps in them) and a DAY GUESTS block (people using the
 * resort that day and leaving in the evening, with any rooms lent to them).
 * Either can be switched off; a date needs at least one.
 *
 * Room numbers already held by other bookings are fetched per date, and a
 * room chosen in one block is greyed out in the other block of the same
 * date — the same physical room can't be slept in and lent out at once.
 * Across dates it can repeat, which is how Room 101 stays booked for three
 * nights: it appears in three overnight blocks.
 */
export function GroupItineraryEditor({
  value, onChange, rooms, nightPackage, dayPackage, excludeBookingId, error,
}: Props) {
  const segments = useMemo(() => sortSegments(value), [value])
  const dates    = useMemo(() => distinctDates(segments), [segments])
  const presence = useMemo(() => presenceByDate(segments), [segments])

  // Taken / noon room numbers per date, fetched once per date in the itinerary.
  const [takenByDate, setTakenByDate] = useState<Record<string, { taken: string[]; noon: string[] }>>({})
  useEffect(() => {
    let cancelled = false
    for (const date of dates) {
      if (takenByDate[date]) continue
      const params = new URLSearchParams({ visitDate: date })
      if (excludeBookingId) params.set('excludeId', excludeBookingId)
      fetch(`/api/booked-room-numbers?${params}`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return
          setTakenByDate((prev) => ({
            ...prev,
            [date]: { taken: d.takenRoomNumbers ?? [], noon: d.noonRoomNumbers ?? [] },
          }))
        })
        .catch(() => { /* leave unknown — the server re-checks on save */ })
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.join(','), excludeBookingId])

  const get = (date: string, kind: StayKind) =>
    segments.find((s) => s.day_date === date && s.stay_kind === kind) ?? null

  function commit(next: GroupSegment[]) { onChange(sortSegments(next)) }

  function setSegment(date: string, kind: StayKind, patch: Partial<GroupSegment>) {
    const existing = get(date, kind)
    const next = existing
      ? segments.map((s) => (s === existing ? { ...s, ...patch } : s))
      : [...segments, { ...blankSegment(date, kind), ...patch }]
    commit(next)
  }

  function removeSegment(date: string, kind: StayKind) {
    commit(segments.filter((s) => !(s.day_date === date && s.stay_kind === kind)))
  }

  function removeDate(date: string) {
    commit(segments.filter((s) => s.day_date !== date))
  }

  function changeDate(from: string, to: string) {
    if (!to || to === from) return
    if (dates.includes(to)) return   // would collide — leave as is
    commit(segments.map((s) => (s.day_date === from ? { ...s, day_date: to } : s)))
  }

  /** Add the next day. Carries the previous night's rooms and guests forward —
   *  most groups keep the same rooms night to night. */
  function addDay() {
    const last = dates[dates.length - 1]
    const date = last ? addDaysIso(last, 1) : todayIso()
    const prevNight = last ? get(last, 'night') : null
    const seed: GroupSegment = prevNight
      ? { ...prevNight, day_date: date, notes: null }
      : blankSegment(date, 'night')
    commit([...segments, seed])
  }

  function duplicateNightTo(date: string) {
    const src = get(date, 'night'); if (!src) return
    const next = addDaysIso(date, 1)
    if (dates.includes(next) && get(next, 'night')) return
    commit([...segments.filter((s) => !(s.day_date === next && s.stay_kind === 'night')),
      { ...src, day_date: next, notes: null }])
  }

  const roomLabel = (t: string) => rooms.find((r) => r.room_type === t)?.display_name ?? t.replace(/_/g, ' ')

  /** Rooms for a block, in RoomSelector's shape. */
  const toSelections = (segRooms: GroupSegmentRoom[]): RoomSelection[] =>
    segRooms.map((r) => ({ ...r, display_name: r.display_name ?? roomLabel(r.room_type), room_numbers: r.room_numbers ?? [] }))

  /** Keep a room's complimentary flag when the selector re-emits it with a package price. */
  const fromSelections = (prev: GroupSegmentRoom[], sel: RoomSelection[]): GroupSegmentRoom[] =>
    sel.map((r) => {
      const was = prev.find((p) => p.room_type === r.room_type)
      return {
        room_type: r.room_type, display_name: r.display_name, qty: r.qty,
        unit_price: was && was.unit_price === 0 ? 0 : r.unit_price,
        room_numbers: r.room_numbers ?? [],
      }
    })

  function toggleComp(date: string, kind: StayKind, roomType: string, pkg: PackageWithPrices | null) {
    const seg = get(date, kind); if (!seg) return
    const price = pkg?.room_prices.find((p) => p.room_type === roomType)?.price ?? 0
    setSegment(date, kind, {
      rooms: seg.rooms.map((r) => r.room_type === roomType
        ? { ...r, unit_price: r.unit_price === 0 ? price : 0 }
        : r),
    })
  }

  return (
    <div className="space-y-4">
      {dates.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No days yet. Add the first day of the group&apos;s visit.
        </p>
      )}

      {dates.map((date) => {
        const night = get(date, 'night')
        const day   = get(date, 'daylong')
        const p     = presence.find((x) => x.date === date)
        const avail = takenByDate[date] ?? { taken: [], noon: [] }
        // Rooms picked in the other block on this date are also off-limits.
        const takenForNight = [...avail.taken, ...(day   ? day.rooms.flatMap((r) => r.room_numbers) : [])]
        const takenForDay   = [...avail.taken, ...(night ? night.rooms.flatMap((r) => r.room_numbers) : [])]
        const dupes = (() => { const n = roomNumbersOnDate(segments, date); return n.filter((x, i) => n.indexOf(x) !== i) })()

        return (
          <div key={date} className="rounded-xl border border-gray-200 bg-white">
            {/* Day header */}
            <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-4 py-3">
              <Input
                type="date" value={date} aria-label="Date"
                onChange={(e) => changeDate(date, e.target.value)}
                className="max-w-[170px]"
              />
              <span className="text-sm font-semibold text-gray-800">{shortDayLabel(date)}</span>
              {p && (
                <span className="text-xs text-gray-500">
                  {p.overnight > 0 && `${p.overnight} overnight`}
                  {p.overnight > 0 && p.day > 0 && ' · '}
                  {p.day > 0 && `${p.day} day guests`}
                  {p.rooms > 0 && ` · ${p.rooms} room${p.rooms === 1 ? '' : 's'}`}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                {night && (
                  <Button type="button" variant="outline" size="sm" onClick={() => duplicateNightTo(date)}
                    title="Copy tonight's rooms and guests to the next night" className="gap-1">
                    <Copy size={12} /> Next night
                  </Button>
                )}
                <button type="button" onClick={() => removeDate(date)} aria-label="Remove day"
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {dupes.length > 0 && (
              <p className="border-b border-red-100 bg-red-50 px-4 py-1.5 text-xs text-red-700">
                Room {[...new Set(dupes)].join(', ')} is used twice on this date.
              </p>
            )}

            {/* Overnight block */}
            <Block
              icon={<Moon size={14} />} title="Overnight" hint="Rooms slept in tonight"
              on={!!night}
              onToggle={(on) => (on ? setSegment(date, 'night', {}) : removeSegment(date, 'night'))}
            >
              {night && (
                <div className="space-y-3">
                  {!nightPackage && (
                    <p className="text-xs font-medium text-amber-700">Pick a night package above to price the rooms.</p>
                  )}
                  <RoomSelector
                    rooms={rooms} selectedPackage={nightPackage} packageType="night"
                    value={toSelections(night.rooms)}
                    onChange={(sel) => setSegment(date, 'night', { rooms: fromSelections(night.rooms, sel) })}
                    bookedRoomNumbers={takenForNight} noonRoomNumbers={avail.noon}
                  />
                  <CompToggles seg={night} pkg={nightPackage} onToggle={(t) => toggleComp(date, 'night', t, nightPackage)} />
                  <GuestInputs
                    packageType="night"
                    value={guestValues(night)}
                    onChange={(v) => setSegment(date, 'night', fromGuestValues(v))}
                  />
                  <CompAdults seg={night} onChange={(n) => setSegment(date, 'night', { adults_comp: n })} />
                  <Input label="Note (optional)" value={night.notes ?? ''} placeholder="e.g. Evening snacks + dinner"
                    onChange={(e) => setSegment(date, 'night', { notes: e.target.value })} />
                </div>
              )}
            </Block>

            {/* Day guests block */}
            <Block
              icon={<Sun size={14} />} title="Day guests" hint="Here for the day, leaving in the evening"
              on={!!day}
              onToggle={(on) => (on ? setSegment(date, 'daylong', {}) : removeSegment(date, 'daylong'))}
            >
              {day && (
                <div className="space-y-3">
                  {!dayPackage && (
                    <p className="text-xs font-medium text-amber-700">Pick a daylong package above to price the day guests.</p>
                  )}
                  <GuestInputs
                    packageType="daylong"
                    value={guestValues(day)}
                    onChange={(v) => setSegment(date, 'daylong', fromGuestValues(v))}
                  />
                  <CompAdults seg={day} onChange={(n) => setSegment(date, 'daylong', { adults_comp: n })} />
                  <div>
                    <p className="mb-1 text-xs font-medium text-gray-700">Rooms for the day (optional)</p>
                    <RoomSelector
                      rooms={rooms} selectedPackage={dayPackage} packageType="daylong"
                      value={toSelections(day.rooms)}
                      onChange={(sel) => setSegment(date, 'daylong', { rooms: fromSelections(day.rooms, sel) })}
                      bookedRoomNumbers={takenForDay} noonRoomNumbers={avail.noon}
                    />
                    <CompToggles seg={day} pkg={dayPackage} onToggle={(t) => toggleComp(date, 'daylong', t, dayPackage)} />
                  </div>
                  <Input label="Note (optional)" value={day.notes ?? ''} placeholder="e.g. Leave after evening snacks"
                    onChange={(e) => setSegment(date, 'daylong', { notes: e.target.value })} />
                </div>
              )}
            </Block>
          </div>
        )
      })}

      <Button type="button" variant="outline" size="md" onClick={addDay} className="w-full gap-1.5">
        <Plus size={14} /> {dates.length === 0 ? 'Add the first day' : 'Add next day'}
      </Button>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Block({ icon, title, hint, on, onToggle, children }: {
  icon: React.ReactNode; title: string; hint: string; on: boolean
  onToggle: (on: boolean) => void; children: React.ReactNode
}) {
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <label className="flex cursor-pointer items-center gap-2 px-4 py-2.5">
        <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 accent-forest-700" />
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800">{icon}{title}</span>
        <span className="text-xs text-gray-400">{hint}</span>
      </label>
      {on && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

/** One checkbox per selected room type: charge it, or lend it for free. */
function CompToggles({ seg, pkg, onToggle }: {
  seg: GroupSegment; pkg: PackageWithPrices | null; onToggle: (roomType: string) => void
}) {
  if (seg.rooms.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {seg.rooms.map((r) => {
        const listPrice = pkg?.room_prices.find((p) => p.room_type === r.room_type)?.price ?? 0
        const comp = r.unit_price === 0
        return (
          <label key={r.room_type}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
              comp ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-gray-300 bg-white text-gray-700'}`}>
            <input type="checkbox" checked={comp} onChange={() => onToggle(r.room_type)} className="h-3.5 w-3.5 accent-emerald-600" />
            {r.display_name ?? r.room_type.replace(/_/g, ' ')} ×{r.qty}
            <span className="text-[11px] text-gray-500">{comp ? '🎁 complimentary' : `${formatBDT(listPrice)}/room`}</span>
          </label>
        )
      })}
    </div>
  )
}

/** Adults counted but not charged per head — the "28 staying on" case. */
function CompAdults({ seg, onChange }: { seg: GroupSegment; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <NumberInput label="Of these adults, not charged" value={seg.adults_comp}
        onChange={(n) => onChange(Math.max(0, Math.min(seg.adults, Math.floor(n))))} min={0} />
      <p className="max-w-xs text-xs text-gray-500">
        Counted for the kitchen and every headcount, skipped by the per-person rate —
        e.g. guests who already paid last night&apos;s package and are staying on.
        {seg.adults_comp > 0 && (
          <span className="block font-medium text-gray-700">
            {seg.adults - seg.adults_comp} of {seg.adults} adults billed.
          </span>
        )}
      </p>
    </div>
  )
}

const guestValues = (s: GroupSegment): GuestValues => ({
  adults: s.adults, children_paid: s.children_paid, children_free: s.children_free,
  drivers: s.drivers, extra_beds: s.extra_beds,
})
const fromGuestValues = (v: GuestValues): Partial<GroupSegment> => ({
  adults: v.adults, children_paid: v.children_paid, children_free: v.children_free,
  drivers: v.drivers, extra_beds: v.extra_beds,
})

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
