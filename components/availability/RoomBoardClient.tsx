'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Lock, Moon, Sun, Search, X, Phone, ExternalLink, Users, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBDT } from '@/lib/formatters/currency'
import { toWhatsAppUrl } from '@/lib/formatters/phone'
import { ROOM_MAP, floorRooms, type MapFloor } from '@/lib/config/room-map'
import type { RoomBoardData } from '@/lib/queries/room-board'
import type { Occupant, RoomCell } from '@/lib/engine/room-board'

/**
 * ROOM BOARD — the resort drawn as it stands, each room split into its DAY
 * half (top) and NIGHT half (bottom, from the evening handover), coloured by
 * who is in it on the chosen date. Rules: lib/engine/room-board.ts; layout:
 * lib/config/room-map.ts.
 */

const GROUP_COLOURS = ['#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c', '#4f46e5']

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const firstName = (n: string) => n.replace(/^~/, '').trim().split(/\s+/)[0] ?? n
const guests = (o: Occupant) => o.adults + o.children

export function RoomBoardClient({ data, today }: { data: RoomBoardData; today: string }) {
  const router = useRouter()
  const { board, date, handoverLabel } = data
  const [query, setQuery]     = useState('')
  const [selected, setSelected] = useState<string | null>(null)   // room number
  const [openFloors, setOpenFloors] = useState<Record<string, boolean>>({})
  const [legend, setLegend]   = useState(false)

  const go = (d: string) => { setSelected(null); router.push(`/availability/rooms?date=${d}`) }

  // Bookings with 2+ numbered rooms on the date get a letter, in map order.
  const groupOf = useMemo(() => {
    const order: string[] = []
    const mapRooms = ROOM_MAP.flatMap((b) => b.floors.flatMap(floorRooms))
    for (const r of mapRooms) {
      const c = board.cells[r]
      for (const o of [c?.day, c?.night]) if (o && o.rooms.length > 1 && !order.includes(o.ref)) order.push(o.ref)
    }
    return new Map(order.map((ref, i) => [ref, { letter: String.fromCharCode(65 + (i % 26)), colour: GROUP_COLOURS[i % GROUP_COLOURS.length] }]))
  }, [board])

  const q = query.trim().toLowerCase()
  const matches = (o: Occupant | null) => !!o && (o.name.toLowerCase().includes(q) || o.ref.toLowerCase().includes(q) || (o.phone ?? '').includes(q))
  const cellMatches = (c: RoomCell) => !q || c.room.toLowerCase() === q || matches(c.day) || matches(c.night) || matches(c.departing)
  const selectedCell = selected ? board.cells[selected] : null
  const selectedRefs = new Set([selectedCell?.day?.ref, selectedCell?.night?.ref].filter(Boolean) as string[])

  // "6:00 PM" → "6PM" — tiles are ~70px wide on a phone.
  const tileHandover = handoverLabel.replace(':00', '').replace(/\s+/g, '')
  const treeHouse = board.unassigned.filter((u) => u.room_type === 'tree_house')
  const unassigned = board.unassigned.filter((u) => u.room_type !== 'tree_house')
  const c = board.counts

  function tile(room: string, wide = false) {
    const cell = board.cells[room]
    if (!cell) return null
    const dim = (!!q && !cellMatches(cell)) || (selectedRefs.size > 0 && ![cell.day?.ref, cell.night?.ref].some((r) => r && selectedRefs.has(r)))
    const merged = cell.day && cell.night && cell.day.ref === cell.night.ref
    const g = groupOf.get(cell.day?.ref ?? '') ?? groupOf.get(cell.night?.ref ?? '')
    return (
      <button
        key={room} type="button" onClick={() => setSelected(selected === room ? null : room)}
        style={{ gridArea: `r${room}`, outline: g ? `2px dotted ${g.colour}` : undefined, outlineOffset: g ? '1px' : undefined }}
        className={cn(
          'relative flex min-h-[78px] flex-col overflow-hidden rounded-lg border text-left transition',
          cell.blocked ? 'border-gray-300 bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_5px,#e5e7eb_5px,#e5e7eb_10px)]' : 'border-gray-300 bg-white',
          selected === room && 'ring-2 ring-forest-600',
          dim && 'opacity-30',
        )}
        aria-label={`Room ${room}`}
      >
        <div className="flex items-center justify-between px-1.5 pt-1">
          <span className="text-[11px] font-bold text-gray-900">{room}</span>
          <span className="flex items-center gap-0.5">
            {cell.blocked && <Lock size={11} className="text-gray-500" />}
            {g && <span className="rounded px-1 text-[9px] font-bold text-white" style={{ background: g.colour }}>{g.letter}</span>}
          </span>
        </div>
        {cell.blocked ? (
          <p className="px-1.5 pb-1 text-[9px] leading-tight text-gray-500">{cell.blocked}</p>
        ) : merged ? (
          <Half occ={cell.day!} kind="both" wide={wide} />
        ) : (
          <>
            <Half occ={cell.day} kind="day" wide={wide} handover={tileHandover} />
            <div className="mx-1 border-t border-dashed border-gray-200" />
            <Half occ={cell.night} kind="night" wide={wide} handover={tileHandover} />
          </>
        )}
        {cell.departing && !cell.blocked && (
          <span className="absolute right-1 top-4 rounded bg-gray-200 px-1 text-[9px] font-semibold text-gray-700" title={`${cell.departing.name} checks out at 12 PM`}>↑12</span>
        )}
      </button>
    )
  }

  function floor(f: MapFloor) {
    const rooms = floorRooms(f)
    return (
      <div key={f.id} className="mb-2">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{f.label}</p>
        <div className="grid gap-1" style={{ gridTemplateColumns: f.cols, gridTemplateAreas: f.areas.map((a) => `"${a}"`).join(' ') }}>
          {f.areas.some((a) => a.includes('cor')) && <div style={{ gridArea: 'cor' }} className="rounded bg-[repeating-linear-gradient(0deg,#f9fafb,#f9fafb_4px,#f3f4f6_4px,#f3f4f6_8px)]" />}
          {rooms.map((r) => tile(r, f.areas.some((a) => a.split(/\s+/).filter((x) => x === `r${r}`).length > 1)))}
        </div>
      </div>
    )
  }

  /** Canopy: runs of floors whose every room is blocked for one reason fold into a bar. */
  function canopyFloors(floors: MapFloor[]) {
    const out: React.ReactNode[] = []
    let i = 0
    while (i < floors.length) {
      const reasonOf = (f: MapFloor) => {
        const rs = floorRooms(f).map((r) => board.cells[r]?.blocked ?? null)
        return rs.every((x) => x && x === rs[0]) ? rs[0] : null
      }
      const reason = reasonOf(floors[i])
      if (!reason) { out.push(floor(floors[i])); i++; continue }
      let j = i
      while (j + 1 < floors.length && reasonOf(floors[j + 1]) === reason) j++
      const run = floors.slice(i, j + 1)
      const key = run.map((f) => f.id).join('|')
      const nums = run.map((f) => f.label.replace('Floor ', '').replace('Ground floor', '1'))
      const label = run.length === 1 ? run[0].label : `Floors ${nums[nums.length - 1]}–${nums[0]}`
      out.push(openFloors[key] ? (
        <div key={key}>{run.map(floor)}<button type="button" onClick={() => setOpenFloors((o) => ({ ...o, [key]: false }))} className="mb-2 text-[11px] text-gray-500 underline">Fold {label.toLowerCase()}</button></div>
      ) : (
        <button key={key} type="button" onClick={() => setOpenFloors((o) => ({ ...o, [key]: true }))}
          className="mb-2 flex w-full items-center justify-between rounded-lg border border-dashed border-gray-300 bg-[repeating-linear-gradient(45deg,#f9fafb,#f9fafb_6px,#f3f4f6_6px,#f3f4f6_12px)] px-3 py-1.5 text-xs text-gray-600">
          <span><Lock size={11} className="mr-1 inline" />{label} · {reason} · {run.length * 5} rooms</span><span>▸</span>
        </button>
      ))
      i = j + 1
    }
    return out
  }

  return (
    <div className={cn(selectedCell && 'lg:pr-[400px]')}>
      {/* Controls */}
      <div className="sticky top-0 z-20 -mx-4 space-y-2 border-b border-gray-200 bg-gray-50/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => go(addDays(date, -1))} className="rounded-lg border border-gray-300 bg-white p-2" aria-label="Previous day"><ChevronLeft size={16} /></button>
          <label className="relative">
            <span className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900">{longDate(date)}</span>
            <input type="date" value={date} onChange={(e) => e.target.value && go(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a date" />
          </label>
          <button type="button" onClick={() => go(addDays(date, 1))} className="rounded-lg border border-gray-300 bg-white p-2" aria-label="Next day"><ChevronRight size={16} /></button>
          {date !== today && <button type="button" onClick={() => go(today)} className="rounded-lg border border-forest-300 bg-forest-50 px-3 py-2 text-xs font-semibold text-forest-800">Today</button>}
          <div className="relative ml-auto min-w-[160px] flex-1 sm:max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Guest, booking # or room"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-8 pr-7 text-sm" />
            {query && <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" aria-label="Clear"><X size={14} /></button>}
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 text-[11px] whitespace-nowrap">
          <Chip tone="green">Free all day {c.freeAllDay}</Chip>
          <Chip tone="gray">After 12 PM {c.freeAfterNoon}</Chip>
          <Chip tone="orange">After {handoverLabel} {c.freeAfterEvening}</Chip>
          <Chip tone="sky">Day only {c.dayOnly}</Chip>
          <Chip tone="blue">Booked {c.booked}</Chip>
          <Chip tone="gray">Blocked {c.blocked}</Chip>
          <Chip tone="plain">Tonight {c.guestsTonight} guests</Chip>
          <Chip tone="plain">Arrivals {c.arrivals}</Chip>
          <Chip tone="plain">Departures {c.departures}</Chip>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          {ROOM_MAP.map((b) => <a key={b.id} href={`#bld-${b.id}`} className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-gray-700">{b.label}</a>)}
          <a href="#bld-other" className="rounded-full border border-gray-300 bg-white px-2.5 py-0.5 text-gray-700">Other</a>
          <button type="button" onClick={() => setLegend((l) => !l)} className="ml-auto text-gray-500 underline">{legend ? 'Hide' : 'Show'} key</button>
        </div>
        {legend && (
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-gray-200 bg-white p-2 text-[11px] text-gray-700 sm:grid-cols-4">
            <span>Top half = day · bottom half = night (from {handoverLabel})</span>
            <span><i className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: '#0072B2' }} /><Moon size={10} className="inline" /> Night stay</span>
            <span><i className="mr-1 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: '#E69F00' }} /><Sun size={10} className="inline" /> Day visit</span>
            <span><i className="mr-1 inline-block h-3 w-3 rounded-sm border border-dashed border-sky-600 bg-sky-50 align-middle" /> Q = confirmed quote holding the room</span>
            <span>↓ arrives · ↑12 checks out at noon</span>
            <span><Lock size={10} className="inline" /> Blocked</span>
            <span>Letter + dotted outline = same booking</span>
            <span><Users size={10} className="inline" /> guests · 2/3 = night 2 of 3</span>
          </div>
        )}
      </div>

      {unassigned.length > 0 && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">{unassigned.length} booking{unassigned.length === 1 ? '' : 's'} without room numbers — not on the map</p>
          <ul className="mt-1 space-y-0.5">
            {unassigned.map((u, i) => (
              <li key={i}>
                {u.occupant.id ? <Link href={`/${u.occupant.kind === 'quote' ? 'quotes' : 'bookings'}/${u.occupant.id}`} className="font-medium underline">{u.occupant.ref}</Link> : u.occupant.ref}
                {' '}· {u.occupant.name} · {u.room_type.replace(/_/g, ' ')} × {u.qty} — open it to assign rooms
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Buildings */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {ROOM_MAP.map((b) => (
          <section key={b.id} id={`bld-${b.id}`} className="scroll-mt-40 rounded-xl border border-gray-200 bg-white p-3">
            <h2 className="mb-2 text-sm font-semibold text-gray-900">{b.label}</h2>
            {b.id === 'west' && <p className="-mt-1 mb-1 text-[10px] text-gray-400">301 + 302 can be sold together as the Two-bedroom Villa</p>}
            {b.id === 'canopy' ? canopyFloors(b.floors) : b.floors.map(floor)}
          </section>
        ))}
        <section id="bld-other" className="scroll-mt-40 rounded-xl border border-gray-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Other</h2>
          <div className="grid grid-cols-2 gap-1" style={{ gridTemplateAreas: '"rConference tree"' }}>
            {tile('Conference')}
            <div style={{ gridArea: 'tree' }} className="flex min-h-[78px] flex-col justify-between rounded-lg border border-gray-300 bg-white p-1.5">
              <span className="text-[11px] font-bold text-gray-900">Tree House</span>
              <span className="text-[11px] text-gray-600">{treeHouse.length ? `${treeHouse.length} day visit${treeHouse.length === 1 ? '' : 's'}` : 'Free'}</span>
              {treeHouse.map((t, i) => <span key={i} className="truncate text-[10px] text-gray-500">{firstName(t.occupant.name)} · {guests(t.occupant)}</span>)}
            </div>
          </div>
        </section>
      </div>

      {/* Detail: bottom sheet on phones, side panel on desktop */}
      {selectedCell && (
        <aside className="fixed inset-x-0 bottom-0 z-40 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-white p-4 shadow-2xl lg:inset-y-0 lg:left-auto lg:right-0 lg:top-0 lg:max-h-none lg:w-[400px] lg:rounded-none lg:border-l lg:border-t-0">
          <div className="mb-3 flex items-start justify-between">
            <div>
              <p className="text-lg font-bold text-gray-900">{selectedCell.room === 'Conference' ? 'Conference Room' : `Room ${selectedCell.room}`}</p>
              <p className="text-xs text-gray-500">{longDate(date)}</p>
            </div>
            <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Close"><X size={18} /></button>
          </div>
          {selectedCell.blocked && <p className="mb-3 rounded-lg bg-gray-100 p-3 text-sm text-gray-700"><Lock size={13} className="mr-1 inline" />Blocked — {selectedCell.blocked}</p>}
          {selectedCell.departing && <Section title="Checking out today (by 12 PM)"><OccCard o={selectedCell.departing} handover={handoverLabel} /></Section>}
          {selectedCell.day && selectedCell.night && selectedCell.day.ref === selectedCell.night.ref ? (
            <Section title="All day and tonight"><OccCard o={selectedCell.day} handover={handoverLabel} /></Section>
          ) : !selectedCell.blocked && (
            <>
              <Section title="Day">{selectedCell.day ? <OccCard o={selectedCell.day} handover={handoverLabel} /> : <Free text={selectedCell.night ? `Free for a day visit until ${handoverLabel}` : selectedCell.departing ? 'Free after 12 PM' : 'Free'} />}</Section>
              <Section title={`Night (from ${handoverLabel})`}>{selectedCell.night ? <OccCard o={selectedCell.night} handover={handoverLabel} /> : <Free text="Free tonight" />}</Section>
            </>
          )}
        </aside>
      )}
    </div>
  )
}

function Chip({ tone, children }: { tone: 'green' | 'gray' | 'orange' | 'sky' | 'blue' | 'plain'; children: React.ReactNode }) {
  const cls = { green: 'border-green-300 bg-green-50 text-green-800', gray: 'border-gray-300 bg-gray-100 text-gray-700', orange: 'border-amber-300 bg-amber-50 text-amber-800',
    sky: 'border-sky-300 bg-sky-50 text-sky-800', blue: 'border-blue-300 bg-blue-50 text-blue-800', plain: 'border-gray-200 bg-white text-gray-700' }[tone]
  return <span className={cn('rounded-full border px-2 py-0.5 font-medium', cls)}>{children}</span>
}

/** One half of a tile (or the whole tile when one booking holds both). */
function Half({ occ, kind, wide, handover = '6 PM' }: { occ: Occupant | null; kind: 'day' | 'night' | 'both'; wide: boolean; handover?: string }) {
  if (!occ) return <div className="flex-1 px-1.5 py-0.5 text-[10px] text-green-700">{kind === 'night' ? '' : '+'}</div>
  const quote = occ.kind === 'quote'
  const night = occ.packageType === 'night'
  const bg = quote ? 'bg-sky-50 border border-dashed border-sky-600 text-sky-900' : night ? 'text-white' : 'text-gray-900'
  const style = quote ? undefined : { background: night ? '#0072B2' : '#E69F00' }
  const arriving = occ.visitDate === undefined ? false : occ.nightIndex === 1
  return (
    <div className={cn('mx-0.5 mb-0.5 flex flex-1 flex-col justify-center rounded px-1 py-0.5 text-[10px] leading-tight', bg, kind === 'both' && 'mt-0.5')} style={style}>
      <span className="flex items-center gap-0.5 truncate font-semibold">
        {quote ? <span className="font-bold">Q</span> : night ? <Moon size={9} /> : <Sun size={9} />}
        <span className="truncate">{firstName(occ.name)}</span>
      </span>
      <span className="flex items-center gap-1 opacity-90">
        <Users size={9} />{guests(occ)}
        {night && occ.nights ? <span>{occ.nightIndex}/{occ.nights}</span> : null}
        {night && arriving && <span>↓</span>}
        {night && occ.evening && <span>{handover}↓</span>}
        {!night && kind === 'day' && <span>→{handover}</span>}
        {wide && occ.packageName && <span className="truncate">· {occ.packageName}</span>}
        {occ.corporate && <Briefcase size={9} />}
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      {children}
    </div>
  )
}

function Free({ text }: { text: string }) {
  return <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{text}</p>
}

function OccCard({ o, handover }: { o: Occupant; handover: string }) {
  const href = o.id ? `/${o.kind === 'quote' ? 'quotes' : 'bookings'}/${o.id}` : null
  return (
    <div className="rounded-xl border border-gray-200 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{o.name}</p>
          <p className="font-mono text-xs text-gray-500">{o.kind === 'quote' ? 'Quote ' : ''}{o.ref}{o.status && o.status !== 'confirmed' ? ` · ${o.status.replace(/_/g, ' ')}` : ''}</p>
        </div>
        <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', o.packageType === 'night' ? 'bg-blue-50 text-blue-800' : 'bg-amber-50 text-amber-800')}>
          {o.group ? 'Group · ' : ''}{o.packageType === 'night' ? 'Night stay' : 'Day visit'}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-700">
        <dt className="text-gray-500">Guests</dt>
        <dd>{o.adults} adult{o.adults === 1 ? '' : 's'}{o.children ? ` · ${o.children} child${o.children === 1 ? '' : 'ren'}` : ''}{o.drivers ? ` · ${o.drivers} driver${o.drivers === 1 ? '' : 's'}` : ''}</dd>
        {o.packageName && <><dt className="text-gray-500">Package</dt><dd className="truncate">{o.packageName}</dd></>}
        <dt className="text-gray-500">Dates</dt>
        <dd>{o.checkOutDate && o.packageType === 'night' ? `${shortDate(o.visitDate)} → ${shortDate(o.checkOutDate)}${o.nights ? ` · night ${o.nightIndex} of ${o.nights}` : ''}` : shortDate(o.visitDate)}</dd>
        {o.evening && <><dt className="text-gray-500">Handover</dt><dd>Room from {handover}</dd></>}
        {o.rooms.length > 1 && <><dt className="text-gray-500">Rooms</dt><dd>{o.rooms.join(', ')}</dd></>}
        {o.corporate && <><dt className="text-gray-500">Corporate</dt><dd className="truncate">{o.company ?? 'Yes'}</dd></>}
        {o.kind === 'booking' && o.remaining !== undefined && <><dt className="text-gray-500">Balance</dt><dd className={o.remaining > 0 ? 'font-semibold text-red-700' : ''}>{formatBDT(o.remaining)}</dd></>}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {href && <Link href={href} className="inline-flex items-center gap-1 rounded-lg bg-forest-700 px-3 py-1.5 text-xs font-semibold text-white"><ExternalLink size={12} /> Open {o.kind === 'quote' ? 'quote' : 'booking'}</Link>}
        {o.phone && <a href={toWhatsAppUrl(o.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800">WhatsApp</a>}
        {o.phone && <a href={`tel:${o.phone}`} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700"><Phone size={12} /> Call</a>}
      </div>
    </div>
  )
}
