'use client'

import { useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { AlertCircle, Loader2, BedDouble, UserPlus } from 'lucide-react'
import { addCharge } from '@/lib/actions/checkout-charges'
import { formatBDT } from '@/lib/formatters/currency'
import { CHARGE_CATEGORY_BADGE } from '@/components/checkout/labels'
import { cn } from '@/lib/utils'
import type {
  ChargeCategoryRow,
  ChargeItemWithCategory,
  PackageSnapshot,
  RoomType,
} from '@/lib/supabase/types'

interface Props {
  open:       boolean
  onClose:    () => void
  bookingId:  string
  /** When provided, enables a "Room / Extra Guest" upsale tab using the
   *  booking's frozen package pricing. */
  snapshot?:  PackageSnapshot | null
  /** For night packages, multiplies room/extra-guest prices by remaining nights. */
  nights?:    number | null
  /** Per-guest unit price for the "Extra Guest" upsale (server-computed).
   *  Daylong → adult rate from line_items. Night → snapshot.extra_person. */
  extraGuestRate?: number | null
}

type TabKey = 'catalog' | 'free' | 'upsale'
type UpsaleKind = 'room' | 'guest'

export function AddChargeModal({ open, onClose, bookingId, snapshot, nights, extraGuestRate }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [tab, setTab] = useState<TabKey>('catalog')
  const [error, setError] = useState<string | null>(null)

  // Catalog — fetched on demand so the parent page doesn't pay the cost on every render
  const [categories, setCategories] = useState<ChargeCategoryRow[]>([])
  const [items, setItems]           = useState<ChargeItemWithCategory[]>([])
  const [catalogLoaded, setCatalogLoaded] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)

  // We only re-run when `open` flips. catalogLoaded/catalogLoading are NOT
  // in the deps — including them caused the cleanup to fire when their own
  // state updates re-rendered the component, which set `cancelled = true`
  // before the fetch resolved → loader stuck forever.
  useEffect(() => {
    if (!open) return
    if (catalogLoaded) return   // already have data; don't refetch
    if (catalogLoading) return  // a previous run is still in flight

    let cancelled = false
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12_000)

    setCatalogLoading(true)
    fetch('/api/checkout/catalog', { signal: controller.signal, cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          let msg = `Failed to load catalog (${r.status})`
          try {
            const body = await r.json()
            if (body?.error) msg = `${msg}: ${body.error}`
          } catch { /* not JSON */ }
          throw new Error(msg)
        }
        return r.json() as Promise<{ categories: ChargeCategoryRow[]; items: ChargeItemWithCategory[] }>
      })
      .then((data) => {
        if (cancelled) return
        setCategories(data.categories ?? [])
        setItems(data.items ?? [])
        setCatalogLoaded(true)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const e = err as { name?: string; message?: string }
        if (e?.name === 'AbortError') {
          setError('Catalog request timed out. Refresh and try again — the server may be slow or the API route is misconfigured.')
        } else {
          setError(e?.message ?? String(err))
        }
      })
      .finally(() => {
        clearTimeout(timeoutId)
        if (!cancelled) setCatalogLoading(false)
      })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Catalog tab state
  const [search, setSearch] = useState('')
  const [chosenItemId, setChosenItemId] = useState<string | null>(null)
  const [catalogQty, setCatalogQty]     = useState<number>(1)
  const [catalogPrice, setCatalogPrice] = useState<number>(0)

  // Free-form state — defaults to first category once loaded
  const [freeCat, setFreeCat]   = useState<string>('')
  const [freeDesc, setFreeDesc] = useState<string>('')
  const [freeQty, setFreeQty]   = useState<number>(1)
  const [freePrice, setFreePrice] = useState<number>(0)
  const [freeNotes, setFreeNotes] = useState<string>('')

  // Upsale tab — extra room or extra guest after the booking was made
  const [upsaleKind, setUpsaleKind] = useState<UpsaleKind>('room')
  const [upsaleRoomType, setUpsaleRoomType] = useState<RoomType | ''>('')
  const [upsaleQty, setUpsaleQty]     = useState<number>(1)
  const [upsalePrice, setUpsalePrice] = useState<number>(0)

  // Available room types from the booking's frozen snapshot
  const snapshotRoomEntries = useMemo<Array<[RoomType, number]>>(() => {
    if (!snapshot?.room_prices) return []
    return Object.entries(snapshot.room_prices)
      .filter(([, p]) => Number(p) > 0)
      .map(([rt, p]) => [rt as RoomType, Number(p)])
  }, [snapshot])

  // Multiplier: night packages charge per night
  const upsaleMultiplier = snapshot?.type === 'night' && nights && nights > 0 ? nights : 1

  // Default the room selection + price when the upsale tab is opened or kind/room changes
  useEffect(() => {
    if (upsaleKind === 'room') {
      if (!upsaleRoomType && snapshotRoomEntries.length > 0) {
        const [rt, price] = snapshotRoomEntries[0]
        setUpsaleRoomType(rt)
        setUpsalePrice(price)
      }
    } else if (upsaleKind === 'guest') {
      // Server-computed: daylong → adult rate from line_items, night → snapshot.extra_person
      setUpsalePrice(Number(extraGuestRate ?? snapshot?.extra_person ?? 0))
    }
  }, [upsaleKind, snapshotRoomEntries, snapshot, upsaleRoomType])

  function pickRoomType(rt: RoomType) {
    setUpsaleRoomType(rt)
    const entry = snapshotRoomEntries.find(([t]) => t === rt)
    if (entry) setUpsalePrice(entry[1])
  }

  // When catalog finishes loading and user hasn't picked a category, default to the first
  useEffect(() => {
    if (catalogLoaded && !freeCat && categories.length > 0) {
      setFreeCat(categories[0].id)
    }
  }, [catalogLoaded, freeCat, categories])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.name.toLowerCase().includes(q))
  }, [items, search])

  // Group filtered items by category for the picker
  const filteredByCategory = useMemo(() => {
    const m = new Map<string, ChargeItemWithCategory[]>()
    for (const it of filtered) {
      const list = m.get(it.category_id) ?? []
      list.push(it)
      m.set(it.category_id, list)
    }
    return m
  }, [filtered])

  const chosen = items.find((i) => i.id === chosenItemId) ?? null

  function reset() {
    setError(null)
    setChosenItemId(null)
    setCatalogQty(1)
    setCatalogPrice(0)
    setFreeDesc('')
    setFreeQty(1)
    setFreePrice(0)
    setFreeNotes('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function selectItem(id: string) {
    const it = items.find((i) => i.id === id) ?? null
    setChosenItemId(id)
    setCatalogQty(1)
    setCatalogPrice(it ? Number(it.default_price) : 0)
  }

  function submit() {
    setError(null)
    if (tab === 'catalog') {
      if (!chosen) { setError('Pick an item from the list'); return }
      startTransition(async () => {
        const r = await addCharge({
          booking_id:     bookingId,
          category_id:    chosen.category_id,
          charge_item_id: chosen.id,
          description:    chosen.name,
          quantity:       catalogQty,
          unit_price:     catalogPrice,
        })
        if (!r.success) { setError(r.error); return }
        reset()
        onClose()
        router.refresh()
      })
    } else if (tab === 'upsale') {
      // Find the matching seeded category by slug
      const slug = upsaleKind === 'room' ? 'room_upsale' : 'extra_guest'
      const category = categories.find((c) => c.slug === slug)
      if (!category) {
        setError(`Category "${slug}" not found. Run migration 002 in Supabase first.`)
        return
      }
      let description: string
      if (upsaleKind === 'room') {
        if (!upsaleRoomType) { setError('Pick a room type'); return }
        description = `${upsaleRoomType.replace('_', ' ')} room (upsale)${upsaleMultiplier > 1 ? ` × ${upsaleMultiplier} nights` : ''}`
      } else {
        description = `Extra guest${upsaleMultiplier > 1 ? ` × ${upsaleMultiplier} nights` : ''}`
      }
      const finalUnitPrice = upsalePrice * upsaleMultiplier
      startTransition(async () => {
        const r = await addCharge({
          booking_id:  bookingId,
          category_id: category.id,
          description,
          quantity:    upsaleQty,
          unit_price:  finalUnitPrice,
        })
        if (!r.success) { setError(r.error); return }
        reset()
        onClose()
        router.refresh()
      })
    } else {
      if (!freeCat) { setError('Pick a category'); return }
      if (!freeDesc.trim()) { setError('Description is required'); return }
      startTransition(async () => {
        const r = await addCharge({
          booking_id:  bookingId,
          category_id: freeCat,
          description: freeDesc.trim(),
          quantity:    freeQty,
          unit_price:  freePrice,
          notes:       freeNotes,
        })
        if (!r.success) { setError(r.error); return }
        reset()
        onClose()
        router.refresh()
      })
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Add Charge" size="xl">
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200 -mt-1">
          <TabButton active={tab === 'catalog'} onClick={() => { setTab('catalog'); setError(null) }}>
            From Catalog
          </TabButton>
          {snapshot && (
            <TabButton active={tab === 'upsale'} onClick={() => { setTab('upsale'); setError(null) }}>
              Room / Extra Guest
            </TabButton>
          )}
          <TabButton active={tab === 'free'} onClick={() => { setTab('free'); setError(null) }}>
            Free-form
          </TabButton>
        </div>

        {tab === 'catalog' && (
          <div className="space-y-3">
            <Input
              placeholder="Search the menu…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              disabled={catalogLoading}
            />
            {catalogLoading && (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
                <Loader2 size={14} className="animate-spin" />
                Loading menu…
              </div>
            )}
            {!catalogLoading && (
            <div className="max-h-72 overflow-y-auto space-y-3 rounded-lg border border-gray-200 p-2">
              {Array.from(filteredByCategory.entries()).map(([catId, list]) => {
                const cat = categories.find((c) => c.id === catId)
                if (!cat) return null
                return (
                  <div key={catId}>
                    <p className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      CHARGE_CATEGORY_BADGE[cat.slug] ?? 'bg-gray-100 text-gray-700 border-gray-200'
                    }`}>
                      {cat.display_name}
                    </p>
                    <ul className="mt-1.5 space-y-1">
                      {list.map((it) => (
                        <li key={it.id}>
                          <button
                            type="button"
                            onClick={() => selectItem(it.id)}
                            className={cn(
                              'flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-sm transition-colors',
                              chosenItemId === it.id
                                ? 'border-violet-400 bg-violet-50'
                                : 'border-gray-200 hover:border-violet-300 hover:bg-violet-50/40',
                            )}
                          >
                            <span className="text-gray-900">{it.name}</span>
                            <span className="font-mono tabular-nums text-gray-600">
                              {formatBDT(Number(it.default_price))}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
              {filtered.length === 0 && (
                <p className="text-center text-xs text-gray-500 py-6">
                  No items match. Use the Free-form tab to add a one-off charge.
                </p>
              )}
            </div>
            )}

            {chosen && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
                <p className="text-sm font-semibold text-gray-900">{chosen.name}</p>
                <div className="grid grid-cols-2 gap-3">
                  <NumberInput label="Quantity" value={catalogQty} onChange={setCatalogQty} />
                  <NumberInput label="Unit price" prefix="৳" value={catalogPrice} onChange={setCatalogPrice} />
                </div>
                <p className="text-xs text-violet-700 font-mono tabular-nums">
                  Total: <span className="font-bold">{formatBDT(catalogQty * catalogPrice)}</span>
                </p>
              </div>
            )}
          </div>
        )}

        {tab === 'upsale' && snapshot && catalogLoading && categories.length === 0 && (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        )}

        {tab === 'upsale' && snapshot && !catalogLoading && categories.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            Charge categories not found. The <strong>room_upsale</strong> and <strong>extra_guest</strong>{' '}
            categories ship with migration{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">checkout-module/002</code>. Run it in Supabase
            and refresh.
          </div>
        )}

        {tab === 'upsale' && snapshot && categories.length > 0 && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-600 mb-1 block">
                What did the guest add?
              </label>
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setUpsaleKind('room')}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors',
                    upsaleKind === 'room' ? 'bg-violet-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <BedDouble size={14} /> Extra Room
                </button>
                <button
                  type="button"
                  onClick={() => setUpsaleKind('guest')}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors',
                    upsaleKind === 'guest' ? 'bg-violet-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50',
                  )}
                >
                  <UserPlus size={14} /> Extra Guest
                </button>
              </div>
            </div>

            {upsaleKind === 'room' && (
              <>
                {snapshotRoomEntries.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                    The booking&apos;s package has no room prices defined. Use Free-form instead.
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-semibold text-gray-600 mb-1 block">
                      Room type (price from booking&apos;s package)
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto">
                      {snapshotRoomEntries.map(([rt, price]) => (
                        <button
                          key={rt}
                          type="button"
                          onClick={() => pickRoomType(rt)}
                          className={cn(
                            'flex items-center justify-between rounded-md border px-2.5 py-1.5 text-sm transition-colors',
                            upsaleRoomType === rt
                              ? 'border-violet-400 bg-violet-50'
                              : 'border-gray-200 hover:border-violet-300 hover:bg-violet-50/40',
                          )}
                        >
                          <span className="text-gray-900 capitalize">{rt.replace('_', ' ')}</span>
                          <span className="font-mono tabular-nums text-gray-600">{formatBDT(price)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {upsaleKind === 'guest' && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 text-xs text-violet-800">
                Per-guest price from the booking&apos;s package: <strong>{formatBDT(Number(extraGuestRate ?? snapshot.extra_person ?? 0))}</strong>
                {snapshot.type === 'night' && ' (per night)'}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <NumberInput
                label={upsaleKind === 'room' ? 'Number of rooms' : 'Number of extra guests'}
                value={upsaleQty}
                onChange={setUpsaleQty}
              />
              <NumberInput
                label={`Unit price${upsaleMultiplier > 1 ? ` (per ${upsaleKind === 'room' ? 'room' : 'guest'}, per night)` : ''}`}
                prefix="৳"
                value={upsalePrice}
                onChange={setUpsalePrice}
              />
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 text-xs text-gray-700 font-mono tabular-nums">
              {upsaleQty} × {formatBDT(upsalePrice)}
              {upsaleMultiplier > 1 && ` × ${upsaleMultiplier} nights`} ={' '}
              <span className="font-bold text-violet-700">
                {formatBDT(upsaleQty * upsalePrice * upsaleMultiplier)}
              </span>
            </div>
          </div>
        )}

        {tab === 'free' && (
          <div className="space-y-3">
            {catalogLoading && categories.length === 0 ? (
              <div className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 text-xs text-gray-500">
                <Loader2 size={14} className="animate-spin" />
                Loading categories…
              </div>
            ) : categories.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                No charge categories found. An admin needs to create at least one in{' '}
                <strong>Settings → Charge Catalog</strong> first. (If you just ran the SQL migration, refresh the page.)
              </div>
            ) : (
              <Select
                label="Category"
                required
                value={freeCat}
                onChange={(e) => setFreeCat(e.target.value)}
              >
                <option value="">— Select a category —</option>
                {categories.filter((c) => c.is_active).map((c) => (
                  <option key={c.id} value={c.id}>{c.display_name}</option>
                ))}
              </Select>
            )}
            <Input
              label="Description"
              required
              placeholder="e.g. Broken table lamp"
              value={freeDesc}
              onChange={(e) => setFreeDesc(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberInput label="Quantity" value={freeQty} onChange={setFreeQty} />
              <NumberInput label="Unit price" prefix="৳" value={freePrice} onChange={setFreePrice} />
            </div>
            <Textarea label="Notes (optional)" rows={2} value={freeNotes} onChange={(e) => setFreeNotes(e.target.value)} />
            <p className="text-xs text-gray-500 font-mono tabular-nums">
              Total: <span className="font-semibold">{formatBDT(freeQty * freePrice)}</span>
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
          <Button type="button" variant="outline" size="md" onClick={handleClose}>Cancel</Button>
          <Button type="button" variant="primary" size="md" loading={pending} onClick={submit}>
            Add Charge
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
        active ? 'border-violet-600 text-violet-700' : 'border-transparent text-gray-500 hover:text-gray-700',
      )}
    >
      {children}
    </button>
  )
}
