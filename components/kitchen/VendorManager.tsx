'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Check, X, Pencil, EyeOff, Eye, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import {
  createKitchenVendor, updateKitchenVendor, deactivateKitchenVendor,
} from '@/lib/actions/kitchen'
import { safeCall } from '@/lib/actions/safe-call'
import type { KitchenVendor } from '@/lib/supabase/types-kitchen'

/**
 * The supplier slots a requisition fans out to. Editable rows rather than a
 * fixed list, so a seventh vendor (bakery, ice, sweets) never needs a
 * migration.
 *
 * Deactivate rather than delete: items and past requisition lines point at
 * these rows, and removing one would blank the vendor on historical orders.
 */
export function VendorManager({
  vendors, itemCounts,
}: {
  vendors: KitchenVendor[]
  /** vendorId → how many items currently point at it. */
  itemCounts: Record<string, number>
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, start] = useTransition()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  function add() {
    const name = newName.trim()
    if (!name) return
    start(async () => {
      const r = await safeCall(() => createKitchenVendor({
        display_name: name,
        sort_order: (vendors[vendors.length - 1]?.sort_order ?? 0) + 1,
        is_active: true,
      }))
      if (!r.success) { toast.error(r.error); return }
      toast.success(`${name} added`)
      setNewName(''); setAdding(false)
      router.refresh()
    })
  }

  function saveEdit(v: KitchenVendor) {
    const name = editName.trim()
    if (!name) return
    start(async () => {
      const r = await safeCall(() => updateKitchenVendor(v.id, {
        display_name: name, sort_order: v.sort_order, is_active: v.is_active,
      }))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Vendor renamed')
      setEditId(null)
      router.refresh()
    })
  }

  function toggleActive(v: KitchenVendor) {
    const count = itemCounts[v.id] ?? 0
    start(async () => {
      if (v.is_active) {
        const ok = await confirm({
          title: `Hide ${v.display_name}?`,
          description: count > 0
            ? `${count} item${count === 1 ? '' : 's'} still point at this vendor. They'll stop appearing in any supplier message until you move them elsewhere.`
            : 'It will no longer appear as an option. Past requisitions keep their record.',
          confirmLabel: 'Hide it', danger: count > 0,
        })
        if (!ok) return
        const r = await safeCall(() => deactivateKitchenVendor(v.id))
        if (!r.success) { toast.error(r.error); return }
        toast.success(`${v.display_name} hidden`)
      } else {
        const r = await safeCall(() => updateKitchenVendor(v.id, {
          display_name: v.display_name, sort_order: v.sort_order, is_active: true,
        }))
        if (!r.success) { toast.error(r.error); return }
        toast.success(`${v.display_name} restored`)
      }
      router.refresh()
    })
  }

  function move(v: KitchenVendor, dir: -1 | 1) {
    start(async () => {
      const r = await safeCall(() => updateKitchenVendor(v.id, {
        display_name: v.display_name,
        sort_order: Math.max(0, v.sort_order + dir * 15),
        is_active: v.is_active,
      }))
      if (!r.success) { toast.error(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {vendors.map((v) => {
          const count = itemCounts[v.id] ?? 0
          const editing = editId === v.id
          return (
            <li key={v.id} className={cn('flex items-center gap-2 p-3', !v.is_active && 'bg-gray-50 opacity-60')}>
              <span className="flex flex-shrink-0 flex-col">
                <button type="button" onClick={() => move(v, -1)} disabled={pending}
                  aria-label="Move up" className="text-gray-300 hover:text-gray-600">▲</button>
                <button type="button" onClick={() => move(v, 1)} disabled={pending}
                  aria-label="Move down" className="text-gray-300 hover:text-gray-600">▼</button>
              </span>

              {editing ? (
                <>
                  <input
                    value={editName} onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(v) }}
                    autoFocus
                    className="min-h-[40px] min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 text-sm"
                  />
                  <button type="button" onClick={() => saveEdit(v)} disabled={pending}
                    aria-label="Save" className="flex h-10 w-10 items-center justify-center rounded-lg text-green-600">
                    <Check size={16} />
                  </button>
                  <button type="button" onClick={() => setEditId(null)}
                    aria-label="Cancel" className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-400">
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">
                      {v.display_name}
                      {!v.is_active && <span className="ml-1.5 text-xs font-normal text-gray-500">(hidden)</span>}
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      {count} item{count === 1 ? '' : 's'} · <code>{v.slug}</code>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => { setEditId(v.id); setEditName(v.display_name) }}
                    aria-label="Rename"
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-500"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button" onClick={() => toggleActive(v)} disabled={pending}
                    aria-label={v.is_active ? 'Hide' : 'Restore'}
                    className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg',
                      v.is_active ? 'text-gray-400' : 'text-forest-600')}
                  >
                    {v.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </>
              )}
            </li>
          )
        })}
      </ul>

      {adding ? (
        <div className="flex gap-2 rounded-xl border border-forest-300 bg-white p-3">
          <input
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add() }}
            placeholder="Vendor name — e.g. Bakery"
            autoFocus
            className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 text-sm"
          />
          <button type="button" onClick={add} disabled={pending || !newName.trim()}
            className="min-h-[44px] rounded-lg bg-forest-700 px-4 text-sm font-semibold text-white disabled:opacity-50">
            Add
          </button>
          <button type="button" onClick={() => { setAdding(false); setNewName('') }}
            aria-label="Cancel" className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button" onClick={() => setAdding(true)}
          className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600"
        >
          <Plus size={16} /> Add a vendor
        </button>
      )}

      <p className="flex items-start gap-1.5 px-1 text-xs text-gray-500">
        <GripVertical size={13} className="mt-0.5 flex-shrink-0" />
        The order here is the order the messages appear on the dispatch screen. Hiding a vendor
        keeps past requisitions intact — it just stops being an option for new ones.
      </p>
    </div>
  )
}
