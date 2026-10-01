'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Pencil, Unlock, AlertCircle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { createRoomBlock, updateRoomBlock, releaseRoomBlock, type RoomBlockInput } from '@/lib/actions/room-blocks'
import { BLOCK_REASONS, WEEKDAY_LABELS, reasonLabel } from '@/lib/engine/blocks'
import type { RoomBlockRow } from '@/lib/queries/room-blocks'
import { ROOM_NUMBERS, isComposite } from '@/lib/config/rooms'
import { formatDate } from '@/lib/formatters/dates'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import type { RoomInventoryRow, RoomType } from '@/lib/supabase/types'

type Scope = 'all' | 'types' | 'rooms'

const empty = (start: string): RoomBlockInput => ({
  all_rooms: false, room_types: [], room_numbers: [], start_date: start, end_date: null,
  weekdays: null, reason_kind: 'maintenance', reason: null,
})

function scopeOf(b: RoomBlockInput): Scope {
  return b.all_rooms ? 'all' : (b.room_types ?? []).length ? 'types' : 'rooms'
}

function chip(on: boolean) {
  return `inline-flex min-h-[34px] items-center rounded-lg border px-2.5 text-xs font-medium ${
    on ? 'border-forest-500 bg-forest-50 text-forest-800' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`
}

function describe(b: RoomBlockRow, names: Map<string, string>): string {
  return [
    b.all_rooms ? 'Whole property' : null,
    b.room_types.length ? b.room_types.map((t) => names.get(t) ?? t.replace(/_/g, ' ')).join(', ') : null,
    b.room_numbers.length ? `Rooms ${b.room_numbers.join(', ')}` : null,
  ].filter(Boolean).join(' + ')
}

/**
 * Taking rooms off sale. One block can cover the whole property, whole room
 * types, specific rooms or a mix; for a date range or until further notice;
 * every day or only on chosen weekdays. A block over an existing booking is
 * refused — the list of collisions comes back so the admin can act on it.
 */
export function RoomBlocksClient({
  blocks, inventory, today, initialStart,
}: {
  blocks:       RoomBlockRow[]
  inventory:    RoomInventoryRow[]
  today:        string
  initialStart: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [form, setForm] = useState<RoomBlockInput>(empty(initialStart))
  const [scope, setScope] = useState<Scope>('rooms')
  const [openEnded, setOpenEnded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const names = useMemo(() => new Map(inventory.map((i) => [i.room_type, i.display_name])), [inventory])
  const numbered = inventory
    .filter((i) => !isComposite(i.room_type))
    .map((i) => ({ type: i.room_type, name: i.display_name, nums: ROOM_NUMBERS[i.room_type as RoomType] ?? [] }))
    .filter((g) => g.nums.length > 0)

  const set = (patch: Partial<RoomBlockInput>) => setForm((f) => ({ ...f, ...patch }))
  const toggle = (list: string[] | undefined, v: string) =>
    (list ?? []).includes(v) ? (list ?? []).filter((x) => x !== v) : [...(list ?? []), v]
  const toggleDay = (d: number) => {
    const cur = form.weekdays ?? []
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()
    set({ weekdays: next.length ? next : null })
  }

  function openNew() {
    setEditing(null); setForm(empty(initialStart)); setScope('rooms'); setOpenEnded(false); setError(null); setOpen(true)
  }
  function openEdit(b: RoomBlockRow) {
    const f: RoomBlockInput = {
      all_rooms: b.all_rooms, room_types: b.room_types, room_numbers: b.room_numbers,
      start_date: b.start_date, end_date: b.end_date, weekdays: b.weekdays,
      reason_kind: b.reason_kind, reason: b.reason,
    }
    setEditing(b.id); setForm(f); setScope(scopeOf(f)); setOpenEnded(!b.end_date); setError(null); setOpen(true)
  }

  function submit() {
    const payload: RoomBlockInput = {
      ...form,
      all_rooms:    scope === 'all',
      room_types:   scope === 'types' ? form.room_types : [],
      room_numbers: scope === 'rooms' ? form.room_numbers : [],
      end_date:     openEnded ? null : (form.end_date || form.start_date),
      reason:       form.reason?.trim() || null,
    }
    setError(null)
    start(async () => {
      const r = await safeCall(() => editing ? updateRoomBlock(editing, payload) : createRoomBlock(payload))
      if (!r.success) { setError(r.error); return }
      toast.success(editing ? 'Block updated' : 'Rooms blocked')
      setOpen(false); setEditing(null)
      router.refresh()
    })
  }

  function release(b: RoomBlockRow) {
    const msg = b.start_date >= today
      ? 'This block has not started yet — remove it?'
      : 'Put these rooms back on sale from today? The block will end yesterday and stay in the history.'
    if (!confirm(msg)) return
    start(async () => {
      const r = await safeCall(() => releaseRoomBlock(b.id))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Rooms back on sale')
      router.refresh()
    })
  }

  const current  = blocks.filter((b) => b.start_date <= today && (!b.end_date || b.end_date >= today))
  const upcoming = blocks.filter((b) => b.start_date > today)
  const past     = blocks.filter((b) => b.end_date && b.end_date < today)

  const Row = ({ b, live }: { b: RoomBlockRow; live: boolean }) => (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <Ban size={15} className={`mt-0.5 flex-shrink-0 ${live ? 'text-red-500' : 'text-gray-300'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{describe(b, names)}</p>
        <p className="text-xs text-gray-600">
          {formatDate(b.start_date)} — {b.end_date ? formatDate(b.end_date) : 'until further notice'}
          {b.weekdays?.length ? ` · ${b.weekdays.map((d) => WEEKDAY_LABELS[d]).join(', ')} only` : ''}
        </p>
        <p className="text-xs text-gray-500">{reasonLabel(b)}{b.released_at ? ' · released early' : ''}</p>
      </div>
      {live && (
        <div className="flex flex-shrink-0 gap-1">
          <button type="button" onClick={() => openEdit(b)} disabled={pending} title="Change dates, rooms or reason"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:text-forest-700"><Pencil size={14} /></button>
          <button type="button" onClick={() => release(b)} disabled={pending} title="Put back on sale"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-green-700 hover:bg-green-50"><Unlock size={14} /></button>
        </div>
      )}
    </li>
  )

  const Section = ({ title, rows, live }: { title: string; rows: RoomBlockRow[]; live: boolean }) => rows.length === 0 ? null : (
    <div>
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">{title} ({rows.length})</h2>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {rows.map((b) => <Row key={b.id} b={b} live={live} />)}
      </ul>
    </div>
  )

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {!open && (
        <Button type="button" variant="primary" size="md" className="gap-1.5" onClick={openNew}>
          <Plus size={14} /> Block rooms
        </Button>
      )}

      {open && (
        <div className="space-y-4 rounded-xl border border-forest-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-gray-900">{editing ? 'Change block' : 'Block rooms'}</h2>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">What</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={chip(scope === 'rooms')} onClick={() => setScope('rooms')}>Specific rooms</button>
              <button type="button" className={chip(scope === 'types')} onClick={() => setScope('types')}>Room types</button>
              <button type="button" className={chip(scope === 'all')}   onClick={() => setScope('all')}>Whole property</button>
            </div>
          </div>

          {scope === 'rooms' && (
            <div className="space-y-2">
              {numbered.map((g) => (
                <div key={g.type}>
                  <p className="mb-1 text-xs text-gray-600">
                    {g.name}
                    <button type="button" className="ml-2 text-forest-700 underline"
                      onClick={() => {
                        const all = g.nums.every((n) => (form.room_numbers ?? []).includes(n))
                        set({ room_numbers: all
                          ? (form.room_numbers ?? []).filter((n) => !g.nums.includes(n))
                          : [...new Set([...(form.room_numbers ?? []), ...g.nums])] })
                      }}>all</button>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {g.nums.map((n) => (
                      <button key={n} type="button" onClick={() => set({ room_numbers: toggle(form.room_numbers, n) })}
                        className={`rounded-md border px-2.5 py-1 font-mono text-xs font-semibold ${
                          (form.room_numbers ?? []).includes(n) ? 'border-red-500 bg-red-600 text-white' : 'border-gray-300 bg-white text-gray-700'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {scope === 'types' && (
            <div className="flex flex-wrap gap-1.5">
              {inventory.map((i) => (
                <button key={i.room_type} type="button" className={chip((form.room_types ?? []).includes(i.room_type))}
                  onClick={() => set({ room_types: toggle(form.room_types, i.room_type) })}>
                  {i.display_name}
                </button>
              ))}
            </div>
          )}

          {scope === 'all' && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Every room in the resort, including the tree house. Nothing can be sold on these dates.
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">From</label>
              <input type="date" value={form.start_date} min={editing ? undefined : today}
                onChange={(e) => set({ start_date: e.target.value })}
                className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2 text-sm" />
            </div>
            <div>
              <label className="field-label">Until (inclusive)</label>
              <input type="date" value={openEnded ? '' : (form.end_date ?? form.start_date)} disabled={openEnded}
                min={form.start_date} onChange={(e) => set({ end_date: e.target.value })}
                className="min-h-[42px] w-full rounded-lg border border-gray-300 px-2 text-sm disabled:bg-gray-50" />
              <label className="mt-1 flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" checked={openEnded} onChange={(e) => setOpenEnded(e.target.checked)} />
                Until further notice
              </label>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Days <span className="font-normal normal-case text-gray-400">— leave all off for every day</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((d, i) => (
                <button key={d} type="button" className={chip((form.weekdays ?? []).includes(i))} onClick={() => toggleDay(i)}>{d}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="field-label">Reason</label>
              <select value={form.reason_kind} onChange={(e) => set({ reason_kind: e.target.value })}
                className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-2 text-sm">
                {BLOCK_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <Input label="Note (optional)" value={form.reason ?? ''} placeholder="e.g. AC compressor replacement"
              onChange={(e) => set({ reason: e.target.value })} />
          </div>

          {error && (
            <p className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0" /> {error}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" size="md" className="flex-1" onClick={() => { setOpen(false); setError(null) }}>Cancel</Button>
            <Button type="button" variant="primary" size="md" className="flex-1" loading={pending} onClick={submit}>
              {editing ? 'Save changes' : 'Block'}
            </Button>
          </div>
        </div>
      )}

      <Section title="In force now" rows={current}  live />
      <Section title="Upcoming"     rows={upcoming} live />
      <Section title="Ended"        rows={past}     live={false} />
      {blocks.length === 0 && !open && (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
          No rooms are blocked.
        </p>
      )}
    </div>
  )
}
