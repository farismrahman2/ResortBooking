'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { AlertCircle } from 'lucide-react'
import { addCharge } from '@/lib/actions/checkout-charges'
import { formatBDT } from '@/lib/formatters/currency'
import { CHARGE_CATEGORY_BADGE } from '@/components/checkout/labels'
import { cn } from '@/lib/utils'
import type {
  ChargeCategoryRow,
  ChargeItemWithCategory,
} from '@/lib/supabase/types'

interface Props {
  open:       boolean
  onClose:    () => void
  bookingId:  string
  categories: ChargeCategoryRow[]
  items:      ChargeItemWithCategory[]
}

type TabKey = 'catalog' | 'free'

export function AddChargeModal({ open, onClose, bookingId, categories, items }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [tab, setTab] = useState<TabKey>('catalog')
  const [error, setError] = useState<string | null>(null)

  // Catalog tab state
  const [search, setSearch] = useState('')
  const [chosenItemId, setChosenItemId] = useState<string | null>(null)
  const [catalogQty, setCatalogQty]     = useState<number>(1)
  const [catalogPrice, setCatalogPrice] = useState<number>(0)

  // Free-form state
  const [freeCat, setFreeCat]   = useState<string>(categories[0]?.id ?? '')
  const [freeDesc, setFreeDesc] = useState<string>('')
  const [freeQty, setFreeQty]   = useState<number>(1)
  const [freePrice, setFreePrice] = useState<number>(0)
  const [freeNotes, setFreeNotes] = useState<string>('')

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
            />
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

        {tab === 'free' && (
          <div className="space-y-3">
            <Select
              label="Category"
              required
              value={freeCat}
              onChange={(e) => setFreeCat(e.target.value)}
            >
              {categories.filter((c) => c.is_active).map((c) => (
                <option key={c.id} value={c.id}>{c.display_name}</option>
              ))}
            </Select>
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
