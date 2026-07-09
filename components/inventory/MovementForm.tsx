'use client'

import { useState, useTransition, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Upload, X } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createReceipt, createIssue, createTransfer, createAdjustment } from '@/lib/actions/inventory'
import { createClient } from '@/lib/supabase/client'
import { formatBDT } from '@/lib/formatters/currency'
import type { InvStore, InvSupplier, InvItemWithStock, MovementType } from '@/lib/supabase/types-inventory'

const RECEIPT_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
const MAX_BYTES    = 10 * 1024 * 1024  // 10 MB

interface LineDraft {
  item_id:    string
  quantity:   string
  unit_price: string
  direction:  'increase' | 'decrease'
}

interface Props {
  type:      MovementType
  stores:    InvStore[]
  suppliers: InvSupplier[]
  items:     InvItemWithStock[]
}

const ADJ_REASONS = ['breakage', 'expired', 'theft', 'loss', 'recount', 'damage', 'other'] as const

const TITLES: Record<MovementType, string> = {
  receipt: 'Receipt', issue: 'Issue', transfer: 'Transfer', adjustment: 'Adjustment',
}

export function MovementForm({ type, stores, suppliers, items }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const [storeId, setStoreId]   = useState(stores[0]?.id ?? '')
  const [toStoreId, setToStoreId] = useState(stores.find((s) => s.id !== stores[0]?.id)?.id ?? '')
  const [date, setDate]         = useState(today)
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [department, setDepartment] = useState('')
  const [reason, setReason]     = useState<typeof ADJ_REASONS[number]>('recount')
  const [notes, setNotes]       = useState('')
  const [lines, setLines]       = useState<LineDraft[]>([{ item_id: '', quantity: '', unit_price: '', direction: 'decrease' }])
  const [photo, setPhoto]       = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const storeItems = useMemo(() => items.filter((i) => i.store_id === storeId), [items, storeId])

  function pickPhoto(f: File | null) {
    setError(null)
    if (!f) { setPhoto(null); return }
    if (!RECEIPT_MIME.includes(f.type as typeof RECEIPT_MIME[number])) { setError('Receipt photo must be JPEG, PNG, WebP, or PDF.'); return }
    if (f.size <= 0 || f.size > MAX_BYTES) { setError('Receipt photo must be between 1 byte and 10 MB.'); return }
    setPhoto(f)
  }

  function setLine(idx: number, patch: Partial<LineDraft>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  function addLine() { setLines((ls) => [...ls, { item_id: '', quantity: '', unit_price: '', direction: 'decrease' }]) }
  function removeLine(idx: number) { setLines((ls) => ls.filter((_, i) => i !== idx)) }

  function onPickItem(idx: number, itemId: string) {
    const it = storeItems.find((i) => i.id === itemId)
    setLine(idx, { item_id: itemId, unit_price: it?.last_purchase_price != null ? String(it.last_purchase_price) : '' })
  }

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)

  function submit() {
    setError(null)
    const cleanLines = lines.filter((l) => l.item_id && Number(l.quantity) > 0)
    if (cleanLines.length === 0) { setError('Add at least one line with an item and quantity'); return }

    // A receipt with a real cost must carry a photo of the paper receipt.
    if (type === 'receipt' && total > 0 && !photo) {
      setError('Attach a photo of the receipt before saving.')
      return
    }

    startTransition(async () => {
      if (type === 'receipt') {
        // Upload the photo FIRST so the receipt is created only once we have it —
        // this avoids duplicate receipts if a post-save upload had to be retried.
        let attachment: {
          storage_path: string; file_name: string
          mime_type: typeof RECEIPT_MIME[number]; size_bytes: number
        } | null = null
        let uploadedPath: string | null = null
        if (photo) {
          const supabase = createClient()
          const [y, m] = date.split('-')
          const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          uploadedPath = `${y}/${m}/inventory-receipts/${Date.now()}-${safeName}`
          const { error: upErr } = await supabase.storage
            .from('expense-receipts')
            .upload(uploadedPath, photo, { contentType: photo.type, upsert: false })
          if (upErr) { setError(`Photo upload failed: ${upErr.message}`); return }
          attachment = {
            storage_path: uploadedPath,
            file_name:    photo.name,
            mime_type:    photo.type as typeof RECEIPT_MIME[number],
            size_bytes:   photo.size,
          }
        }

        const res = await createReceipt({
          movement_date: date, store_id: storeId, supplier_id: supplierId,
          invoice_number: invoiceNumber.trim() || null, notes: notes.trim() || null,
          attachment,
          lines: cleanLines.map((l) => ({ item_id: l.item_id, quantity: Number(l.quantity), unit_price: Number(l.unit_price) || 0 })),
        })
        if (!res.success) {
          // Remove the orphaned upload so a retry doesn't litter storage
          if (uploadedPath) await createClient().storage.from('expense-receipts').remove([uploadedPath])
          setError(res.error)
          return
        }
        router.push('/inventory/movements')
        router.refresh()
        return
      }

      let res
      if (type === 'issue') {
        res = await createIssue({
          movement_date: date, store_id: storeId, issued_to_department: department.trim(), notes: notes.trim() || null,
          lines: cleanLines.map((l) => ({ item_id: l.item_id, quantity: Number(l.quantity) })),
        })
      } else if (type === 'transfer') {
        res = await createTransfer({
          movement_date: date, store_id: storeId, transfer_to_store_id: toStoreId, notes: notes.trim() || null,
          lines: cleanLines.map((l) => ({ item_id: l.item_id, quantity: Number(l.quantity) })),
        })
      } else {
        res = await createAdjustment({
          movement_date: date, store_id: storeId, adjustment_reason: reason, notes: notes.trim() || null,
          lines: cleanLines.map((l) => ({ item_id: l.item_id, quantity: Number(l.quantity), adjustment_direction: l.direction })),
        })
      }
      if (!res.success) { setError(res.error); return }
      router.push('/inventory/movements')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Select
          label={type === 'transfer' ? 'From store' : 'Store'} value={storeId}
          onChange={(e) => setStoreId(e.target.value)} required
          options={stores.map((s) => ({ value: s.id, label: s.display_name }))}
        />
      </div>

      {type === 'receipt' && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required
              options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
            <Input label="Invoice #" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </div>

          <div>
            <label className="field-label">
              Receipt photo {total > 0 && <span className="text-red-500">*</span>}
            </label>
            {!photo ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-4 text-sm font-medium text-gray-600 hover:border-teal-400 hover:bg-teal-50/40"
              >
                <Upload size={16} /> Upload a photo of the receipt
              </button>
            ) : (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
                <span className="truncate text-gray-700">
                  {photo.name} · {(photo.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button type="button" onClick={() => pickPhoto(null)}
                  className="ml-2 flex-shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove photo">
                  <X size={15} />
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <p className="mt-1 text-[10px] text-gray-400">
              JPEG, PNG, WebP, or PDF · max 10 MB. Also attached to the linked expense.
            </p>
          </div>
        </>
      )}
      {type === 'issue' && (
        <Input label="Issued to (department)" value={department} onChange={(e) => setDepartment(e.target.value)} required />
      )}
      {type === 'transfer' && (
        <Select label="To store" value={toStoreId} onChange={(e) => setToStoreId(e.target.value)} required
          options={stores.filter((s) => s.id !== storeId).map((s) => ({ value: s.id, label: s.display_name }))} />
      )}
      {type === 'adjustment' && (
        <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value as typeof ADJ_REASONS[number])} required
          options={ADJ_REASONS.map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))} />
      )}

      {/* Lines */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Items</h3>
          <Button variant="outline" size="sm" onClick={addLine}><Plus size={13} className="mr-1" /> Add line</Button>
        </div>
        <div className="space-y-2">
          {lines.map((l, idx) => (
            <div key={idx} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[160px] flex-1">
                <label className="field-label">Item</label>
                <select
                  value={l.item_id} onChange={(e) => onPickItem(idx, e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100"
                >
                  <option value="">Select item…</option>
                  {storeItems.map((i) => (
                    <option key={i.id} value={i.id}>{i.name} ({i.sku_code}) · {i.current_stock}{i.unit?.abbreviation ? ' ' + i.unit.abbreviation : ''}</option>
                  ))}
                </select>
              </div>
              <div className="w-24">
                <Input label="Qty" type="number" step="0.001" min="0" value={l.quantity} onChange={(e) => setLine(idx, { quantity: e.target.value })} />
              </div>
              {type === 'receipt' && (
                <div className="w-28">
                  <Input label="Unit price" type="number" step="0.01" min="0" value={l.unit_price} onChange={(e) => setLine(idx, { unit_price: e.target.value })} />
                </div>
              )}
              {type === 'adjustment' && (
                <div className="w-32">
                  <Select label="Direction" value={l.direction} onChange={(e) => setLine(idx, { direction: e.target.value as 'increase' | 'decrease' })}
                    options={[{ value: 'decrease', label: 'Decrease' }, { value: 'increase', label: 'Increase' }]} />
                </div>
              )}
              <button type="button" onClick={() => removeLine(idx)} className="mb-1.5 rounded-md p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove line">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
        {type === 'receipt' && (
          <div className="mt-3 flex justify-end border-t border-gray-100 pt-3 text-sm">
            <span className="text-gray-500">Total:&nbsp;</span>
            <span className="font-semibold tabular-nums text-gray-900">{formatBDT(total)}</span>
          </div>
        )}
      </div>

      <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="flex gap-2 pt-1">
        <Button onClick={submit} loading={pending} disabled={type === 'receipt' && total > 0 && !photo}>Save {TITLES[type]}</Button>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  )
}
