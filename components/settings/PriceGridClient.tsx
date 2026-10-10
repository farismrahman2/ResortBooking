'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, MoreVertical } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { roomTypeBuilding, BUILDING_LABEL, type Building } from '@/lib/config/rooms'
import {
  adjustCell, cellKey, copyColumn, isPriceable, needsAttention, parseCell, pctChange,
  type Cell, type PriceChange,
} from '@/lib/pricing/price-grid'
import { savePriceGrid } from '@/lib/actions/room-prices'
import { toast } from '@/lib/toast/store'

export interface GridPackage {
  id: string; name: string; type: 'daylong' | 'night'; is_active: boolean
  all_year: boolean; valid_from: string | null; valid_to: string | null
}
export interface GridRoom { room_type: string; display_name: string; daylong_only: boolean }

interface Props {
  packages: GridPackage[]
  rooms:    GridRoom[]
  /** cellKey → stored price (absent = not offered). */
  prices:   Record<string, number>
  canEdit:  boolean
}

const taka = (n: number) => n.toLocaleString('en-IN')
const show = (v: Cell) => (v === null ? '—' : v === 0 ? '0 (comp only)' : `৳${taka(v)}`)
const validity = (p: GridPackage) =>
  p.all_year ? 'All year'
  : p.valid_from && p.valid_to ? `${p.valid_from.slice(5).replace('-', '/')}–${p.valid_to.slice(5).replace('-', '/')}`
  : 'Dates set'

/**
 * Room Prices grid — every room type against every package. Rows are room
 * types (Main / Canopy), columns packages; on a phone, pick a package and
 * edit its list. Edits are drafts until "Review & save"; the save refuses
 * if someone else changed a cell meanwhile. Rules: lib/pricing/price-grid.ts.
 */
export function PriceGridClient({ packages, rooms, prices, canEdit }: Props) {
  const router = useRouter()
  const [kind, setKind]             = useState<'all' | 'daylong' | 'night'>('all')
  const [activeOnly, setActiveOnly] = useState(true)
  const [collapsed, setCollapsed]   = useState<Record<string, boolean>>({})
  const [saved, setSaved]           = useState<Record<string, number>>(prices)
  const [draft, setDraft]           = useState<Record<string, Cell>>({})
  const [conflicts, setConflicts]   = useState<Set<string>>(new Set())
  const [reviewing, setReviewing]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [tool, setTool]             = useState<{ pkg: GridPackage; mode: 'copy' | 'adjust' } | null>(null)
  const [menuFor, setMenuFor]       = useState<string | null>(null)
  const [phonePkg, setPhonePkg]     = useState<string>('')

  useEffect(() => { setSaved(prices) }, [prices])

  const columns = useMemo(
    () => packages.filter((p) => (kind === 'all' || p.type === kind) && (!activeOnly || p.is_active)),
    [packages, kind, activeOnly],
  )
  useEffect(() => {
    if (!columns.some((c) => c.id === phonePkg)) setPhonePkg(columns[0]?.id ?? '')
  }, [columns, phonePkg])

  const groups = useMemo(() => {
    const by = new Map<Building, GridRoom[]>()
    for (const r of rooms) {
      const b = roomTypeBuilding(r.room_type)
      by.set(b, [...(by.get(b) ?? []), r])
    }
    return (['main', 'canopy', 'other'] as Building[]).filter((b) => by.has(b)).map((b) => ({ building: b, rooms: by.get(b)! }))
  }, [rooms])
  const rowOrder = useMemo(() => groups.flatMap((g) => (collapsed[g.building] ? [] : g.rooms)), [groups, collapsed])

  const savedValue = (k: string): Cell => (k in saved ? saved[k] : null)
  const valueOf    = (k: string): Cell => (k in draft ? draft[k] : savedValue(k))
  const changes: Array<PriceChange & { pkg: GridPackage; room: GridRoom }> = useMemo(() => {
    const out: Array<PriceChange & { pkg: GridPackage; room: GridRoom }> = []
    for (const [k, v] of Object.entries(draft)) {
      const [package_id, room_type] = k.split('|')
      const expected = k in saved ? saved[k] : null
      if (v === expected) continue
      const pkg = packages.find((p) => p.id === package_id); const room = rooms.find((r) => r.room_type === room_type)
      if (pkg && room) out.push({ package_id, room_type, price: v, expected, pkg, room })
    }
    return out
  }, [draft, saved, packages, rooms])
  const dirty = changes.length > 0

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  function setCell(k: string, v: Cell) {
    setDraft((d) => ({ ...d, [k]: v }))
    setConflicts((c) => { if (!c.has(k)) return c; const n = new Set(c); n.delete(k); return n })
  }
  function revertCell(k: string) {
    setDraft((d) => { const n = { ...d }; delete n[k]; return n })
  }

  // Enter / Shift+Enter move down / up a column (Tab moves along the row).
  const gridRef = useRef<HTMLDivElement>(null)
  function moveFocus(row: number, col: number) {
    gridRef.current?.querySelector<HTMLInputElement>(`input[data-r="${row}"][data-c="${col}"]`)?.focus()
  }

  async function save() {
    setSaving(true)
    const res = await savePriceGrid(changes.map(({ package_id, room_type, price, expected }) => ({ package_id, room_type, price, expected })))
    setSaving(false)
    if (res.success) {
      const next = { ...saved }
      for (const c of changes) {
        const k = cellKey(c.package_id, c.room_type)
        if (c.price === null) delete next[k]; else next[k] = c.price
      }
      setSaved(next); setDraft({}); setReviewing(false)
      toast.success(`${res.saved} price${res.saved === 1 ? '' : 's'} saved`)
      router.refresh()
      return
    }
    if (res.conflicts?.length) {
      // Show what is stored now; keep the user's drafts so nothing is lost.
      const next = { ...saved }
      for (const c of res.conflicts) {
        const k = cellKey(c.package_id, c.room_type)
        if (c.current === null) delete next[k]; else next[k] = c.current
      }
      setSaved(next)
      setConflicts(new Set(res.conflicts.map((c) => cellKey(c.package_id, c.room_type))))
      setReviewing(false)
    }
    toast.error(res.error)
  }

  const priceable = (pkg: GridPackage, room: GridRoom) => isPriceable(room.room_type, pkg.type, room.daylong_only)

  function cellInput(pkg: GridPackage, room: GridRoom, r: number, c: number, wide = false) {
    const k = cellKey(pkg.id, room.room_type)
    if (!priceable(pkg, room)) {
      return <div className="rounded bg-[repeating-linear-gradient(45deg,#f3f4f6,#f3f4f6_4px,#fff_4px,#fff_8px)] px-2 py-1.5 text-center text-[11px] text-gray-400" title="Day-only room — not sold on night packages">n/a</div>
    }
    return (
      <PriceCell
        value={valueOf(k)} saved={savedValue(k)} changed={k in draft && draft[k] !== savedValue(k)}
        conflict={conflicts.has(k)} disabled={!canEdit} wide={wide} r={r} c={c}
        onChange={(v) => setCell(k, v)} onRevert={() => revertCell(k)}
        onEnter={(up) => moveFocus(r + (up ? -1 : 1), c)}
      />
    )
  }

  // Default to the first package shown, from the very first render.
  const phoneColumn = columns.find((p) => p.id === phonePkg) ?? columns[0]

  return (
    <div className="space-y-4 pb-24">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
          {(['daylong', 'night', 'all'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={cn('rounded-md px-3 py-1.5 font-medium', kind === k ? 'bg-forest-600 text-white' : 'text-gray-600 hover:bg-gray-100')}>
              {k === 'daylong' ? 'Day long' : k === 'night' ? 'Night' : 'All'}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} className="h-4 w-4 accent-forest-600" />
          Active packages only
        </label>
        {!canEdit && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">View only</span>}
      </div>

      <p className="text-xs text-gray-500">
        <b className="text-gray-700">—</b> not offered · <b className="text-gray-700">0</b> complimentary only (can be given free, never sold) · n/a can&apos;t be sold on that package.
        Conference room: priced per day on the quote. Existing quotes and bookings keep their prices.
      </p>

      {columns.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">No packages match these filters.</p>
      ) : (
        <>
          {/* Desktop: the matrix */}
          <div ref={gridRef} className="hidden max-h-[70vh] overflow-auto rounded-xl border border-gray-200 bg-white md:block">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 border-b border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Room</th>
                  {columns.map((p) => (
                    <th key={p.id} className="sticky top-0 z-20 min-w-[124px] border-b border-l border-gray-200 bg-gray-50 px-2 py-2 text-left align-top font-normal">
                      <div className="flex items-start justify-between gap-1">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-gray-900" title={p.name}>{p.name}</p>
                          <p className="mt-0.5 text-[10px] text-gray-500">
                            <span className={cn('mr-1 rounded px-1 font-semibold', p.type === 'night' ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700')}>{p.type === 'night' ? 'Night' : 'Day'}</span>
                            {validity(p)}
                          </p>
                          {!p.is_active && <span className="mt-0.5 inline-block rounded bg-gray-200 px-1 text-[10px] text-gray-600">Inactive</span>}
                        </div>
                        {canEdit && (
                          <div className="relative">
                            <button type="button" aria-label={`Tools for ${p.name}`} onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}
                              className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700"><MoreVertical size={14} /></button>
                            {menuFor === p.id && (
                              <div className="absolute right-0 z-40 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 text-left shadow-lg">
                                <button type="button" className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50" onClick={() => { setTool({ pkg: p, mode: 'copy' }); setMenuFor(null) }}>Copy prices from…</button>
                                <button type="button" className="block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50" onClick={() => { setTool({ pkg: p, mode: 'adjust' }); setMenuFor(null) }}>Adjust by % or ৳…</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g.building} title={BUILDING_LABEL[g.building]} count={g.rooms.length} cols={columns.length}
                    collapsed={!!collapsed[g.building]} onToggle={() => setCollapsed((c) => ({ ...c, [g.building]: !c[g.building] }))}>
                    {g.rooms.map((room) => {
                      const r = rowOrder.indexOf(room)
                      return (
                        <tr key={room.room_type}>
                          <th className="sticky left-0 z-10 border-b border-gray-100 bg-white px-3 py-1.5 text-left text-sm font-medium text-gray-800">{room.display_name}</th>
                          {columns.map((p, c) => (
                            <td key={p.id} className="border-b border-l border-gray-100 px-1.5 py-1">{cellInput(p, room, r, c)}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </GroupRows>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: one package at a time */}
          <div className="space-y-3 md:hidden">
            <select value={phoneColumn?.id ?? ''} onChange={(e) => setPhonePkg(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm">
              {columns.map((p) => <option key={p.id} value={p.id}>{p.name.trim()} · {p.type === 'night' ? 'Night' : 'Day'}{p.is_active ? '' : ' (inactive)'}</option>)}
            </select>
            {phoneColumn && (
              <>
                <p className="text-xs text-gray-500">{validity(phoneColumn)}{phoneColumn.is_active ? '' : ' · inactive'}</p>
                {canEdit && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setTool({ pkg: phoneColumn, mode: 'copy' })} className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-xs font-medium text-gray-700">Copy prices from…</button>
                    <button type="button" onClick={() => setTool({ pkg: phoneColumn, mode: 'adjust' })} className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-xs font-medium text-gray-700">Adjust by % or ৳…</button>
                  </div>
                )}
                {groups.map((g) => (
                  <div key={g.building} className="rounded-xl border border-gray-200 bg-white">
                    <p className="border-b border-gray-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{BUILDING_LABEL[g.building]}</p>
                    {g.rooms.map((room) => {
                      const k = cellKey(phoneColumn.id, room.room_type)
                      const changed = k in draft && draft[k] !== savedValue(k)
                      return (
                        <div key={room.room_type} className="flex items-center justify-between gap-3 border-b border-gray-50 px-3 py-2 last:border-0">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800">{room.display_name}</p>
                            {changed && <p className="text-[11px] text-amber-700">was {show(savedValue(k))}</p>}
                          </div>
                          <div className="w-32 shrink-0">{cellInput(phoneColumn, room, -1, -1, true)}</div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* Save bar */}
      {canEdit && dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:left-60">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm text-gray-700"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" />{changes.length} price{changes.length === 1 ? '' : 's'} changed</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => { if (window.confirm('Discard all unsaved price changes?')) setDraft({}) }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Discard</button>
              <button type="button" onClick={() => setReviewing(true)}
                className="rounded-lg bg-forest-600 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-700">Review &amp; save</button>
            </div>
          </div>
        </div>
      )}

      <ReviewDialog open={reviewing} onClose={() => setReviewing(false)} changes={changes} saving={saving} onConfirm={save} />

      {tool && (
        <ToolDialog
          tool={tool} packages={packages} rooms={rooms}
          valueOf={valueOf} priceable={priceable}
          onClose={() => setTool(null)}
          onApply={(cells) => { for (const [k, v] of Object.entries(cells)) setCell(k, v); setTool(null) }}
        />
      )}
    </div>
  )
}

function GroupRows({ title, count, cols, collapsed, onToggle, children }: {
  title: string; count: number; cols: number; collapsed: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <>
      <tr>
        <td colSpan={cols + 1} className="sticky left-0 border-b border-gray-200 bg-gray-50/80 px-3 py-1.5">
          <button type="button" onClick={onToggle} className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-gray-600">
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />} {title} <span className="font-normal normal-case text-gray-400">· {count} room types</span>
          </button>
        </td>
      </tr>
      {!collapsed && children}
    </>
  )
}

/** One price. Shows "5,200" at rest, plain digits while typing; Esc reverts. */
function PriceCell({ value, saved, changed, conflict, disabled, wide, r, c, onChange, onRevert, onEnter }: {
  value: Cell; saved: Cell; changed: boolean; conflict: boolean; disabled: boolean; wide: boolean; r: number; c: number
  onChange: (v: Cell) => void; onRevert: () => void; onEnter: (up: boolean) => void
}) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  const display = value === null ? '' : focused ? String(value) : taka(value)
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">৳</span>
      <input
        type="text" inputMode="numeric" disabled={disabled} data-r={r} data-c={c}
        value={focused ? text : display}
        placeholder="—"
        title={changed ? `Was ${show(saved)}` : conflict ? 'Changed by someone else — now shows the stored price' : undefined}
        onFocus={() => { setFocused(true); setText(value === null ? '' : String(value)); setBad(false) }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value)
          const v = parseCell(e.target.value)
          if (v === undefined) { setBad(true); return }
          setBad(false); onChange(v)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { onRevert(); setText(saved === null ? '' : String(saved)); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Enter') { e.preventDefault(); onEnter(e.shiftKey) }
        }}
        className={cn(
          'w-full rounded border py-1.5 pl-5 pr-5 text-right font-mono text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-forest-200',
          wide ? 'min-h-[44px]' : '',
          bad ? 'border-red-400' : conflict ? 'border-red-400 bg-red-50' : changed ? 'border-amber-300 bg-amber-50' : 'border-transparent hover:border-gray-200',
          disabled && 'cursor-default bg-transparent text-gray-700',
        )}
      />
      {value === 0 && <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600" title="Complimentary only">◇</span>}
      {changed && value !== 0 && <span className="pointer-events-none absolute right-1.5 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-amber-500" />}
    </div>
  )
}

function ReviewDialog({ open, onClose, changes, saving, onConfirm }: {
  open: boolean; onClose: () => void; saving: boolean; onConfirm: () => void
  changes: Array<PriceChange & { pkg: GridPackage; room: GridRoom }>
}) {
  const pkgCount = new Set(changes.map((c) => c.package_id)).size
  return (
    <Modal open={open} onClose={onClose} title="Review price changes" size="lg">
      <p className="text-sm text-gray-700">{changes.length} price{changes.length === 1 ? '' : 's'} changed across {pkgCount} package{pkgCount === 1 ? '' : 's'}.</p>
      <div className="mt-3 max-h-[50vh] overflow-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 text-left text-xs text-gray-500">
            <tr><th className="px-3 py-2">Package</th><th className="px-3 py-2">Room</th><th className="px-3 py-2 text-right">Old</th><th className="px-3 py-2 text-right">New</th><th className="px-3 py-2 text-right">±</th></tr>
          </thead>
          <tbody>
            {changes.map((c) => {
              const p = pctChange(c.expected, c.price)
              const flag = needsAttention(c.expected, c.price)
              return (
                <tr key={`${c.package_id}|${c.room_type}`} className={cn('border-t border-gray-100', flag && 'bg-amber-50')}>
                  <td className="px-3 py-1.5 text-gray-700">{c.pkg.name}</td>
                  <td className="px-3 py-1.5 text-gray-700">{c.room.display_name}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-500">{show(c.expected)}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-medium text-gray-900">{c.price === null ? 'removed (not offered)' : show(c.price)}</td>
                  <td className={cn('px-3 py-1.5 text-right font-mono', flag ? 'font-semibold text-amber-700' : 'text-gray-500')}>{p === null ? '' : `${p > 0 ? '+' : ''}${p}%`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Existing quotes and bookings keep their prices. New quotes — and rooms whose quantity is changed on an open quote — use the new prices.
        Highlighted rows: a change over 30%, a new ৳0 (complimentary only), or a room removed from a package.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Back</button>
        <button type="button" disabled={saving} onClick={onConfirm} className="rounded-lg bg-forest-600 px-4 py-2 text-sm font-semibold text-white hover:bg-forest-700 disabled:opacity-60">
          {saving ? 'Saving…' : `Save ${changes.length} change${changes.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  )
}

function ToolDialog({ tool, packages, rooms, valueOf, priceable, onClose, onApply }: {
  tool: { pkg: GridPackage; mode: 'copy' | 'adjust' }
  packages: GridPackage[]; rooms: GridRoom[]
  valueOf: (k: string) => Cell
  priceable: (pkg: GridPackage, room: GridRoom) => boolean
  onClose: () => void
  onApply: (cells: Record<string, Cell>) => void
}) {
  const target = tool.pkg
  const sources = packages.filter((p) => p.id !== target.id).sort((a, b) => Number(b.type === target.type) - Number(a.type === target.type))
  const [source, setSource]   = useState(sources[0]?.id ?? '')
  const [onlyEmpty, setOnlyEmpty] = useState(false)
  const [mode, setMode]       = useState<'pct' | 'abs'>('pct')
  const [amount, setAmount]   = useState('10')
  const [step, setStep]       = useState(100)

  function apply() {
    const cells: Record<string, Cell> = {}
    if (tool.mode === 'copy') {
      const src = Object.fromEntries(rooms.map((r) => [r.room_type, valueOf(cellKey(source, r.room_type))]))
      const tgt = Object.fromEntries(rooms.map((r) => [r.room_type, valueOf(cellKey(target.id, r.room_type))]))
      const okFor = (t: string) => { const room = rooms.find((r) => r.room_type === t); return !!room && priceable(target, room) }
      for (const [t, v] of Object.entries(copyColumn(src, tgt, okFor, onlyEmpty))) cells[cellKey(target.id, t)] = v
    } else {
      const n = Number(amount)
      if (!Number.isFinite(n)) return
      for (const r of rooms) {
        if (!priceable(target, r)) continue
        const k = cellKey(target.id, r.room_type)
        const next = adjustCell(valueOf(k), mode, n, step)
        if (next !== valueOf(k)) cells[k] = next
      }
    }
    onApply(cells)
  }

  return (
    <Modal open onClose={onClose} title={tool.mode === 'copy' ? `Copy prices into ${target.name}` : `Adjust ${target.name}`} size="sm">
      {tool.mode === 'copy' ? (
        <div className="space-y-3 text-sm">
          <label className="block">
            <span className="field-label">Copy from</span>
            <select value={source} onChange={(e) => setSource(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
              {sources.map((p) => <option key={p.id} value={p.id}>{p.name.trim()} · {p.type === 'night' ? 'Night' : 'Day'}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2"><input type="radio" checked={!onlyEmpty} onChange={() => setOnlyEmpty(false)} /> Overwrite every price</label>
          <label className="flex items-center gap-2"><input type="radio" checked={onlyEmpty} onChange={() => setOnlyEmpty(true)} /> Only fill rooms not offered yet</label>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex gap-2">
            <select value={mode} onChange={(e) => setMode(e.target.value as 'pct' | 'abs')} className="rounded-lg border border-gray-300 px-2 py-2">
              <option value="pct">%</option><option value="abs">৳</option>
            </select>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.-]/g, ''))} inputMode="decimal"
              className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-right font-mono" />
            <select value={step} onChange={(e) => setStep(Number(e.target.value))} className="rounded-lg border border-gray-300 px-2 py-2">
              <option value={100}>round to ৳100</option><option value={50}>round to ৳50</option>
            </select>
          </div>
          <p className="text-xs text-gray-500">Use a minus for a cut (−5). Rooms at 0 or not offered are left as they are.</p>
        </div>
      )}
      <p className="mt-3 text-xs text-gray-500">Nothing is saved yet — the cells are marked as changed for you to review.</p>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700">Cancel</button>
        <button type="button" onClick={apply} className="rounded-lg bg-forest-600 px-4 py-2 text-sm font-semibold text-white">Apply</button>
      </div>
    </Modal>
  )
}
