'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Search, Save, EyeOff, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { saveTemplate, deleteTemplate } from '@/lib/actions/kitchen-templates'
import { safeCall } from '@/lib/actions/safe-call'
import type { KitchenVendor, TemplateWithLines } from '@/lib/supabase/types-kitchen'
import { buildSearchIndex, searchItems } from '@/lib/kitchen/item-search'
import type { PickerItemRow } from '@/lib/queries/kitchen'

interface Line {
  item_id:   string | null
  item_name: string
  kitchen_vendor_id: string | null
  qty:         string
  piece_count: string
  unit_id:    string | null
  unit_label: string | null
  notes:      string
}

/**
 * Editing a standing list.
 *
 * No autosave, unlike the requisition form. A template is edited occasionally
 * and deliberately, and a half-finished edit saving itself is the one thing
 * that would make everyone's daily order wrong tomorrow morning. Explicit Save.
 *
 * Quantities are the normal-day figure. They're pre-filled into the
 * requisition and adjusted against the headcount banner there, so a rough
 * number here is worth far more than a blank.
 */
export function TemplateForm({
  templateId, initial, vendors, items,
}: {
  templateId?: string
  initial:     TemplateWithLines | null
  vendors:     KitchenVendor[]
  items:       PickerItemRow[]
}) {
  const router = useRouter()
  const confirm = useConfirm()
  const [pending, start] = useTransition()

  const [name, setName]         = useState(initial?.name ?? '')
  const [description, setDesc]  = useState(initial?.description ?? '')
  const [isActive, setActive]   = useState(initial?.is_active ?? true)
  const [lines, setLines] = useState<Line[]>(() =>
    (initial?.lines ?? []).map((l) => ({
      item_id: l.item_id, item_name: l.item_name,
      kitchen_vendor_id: l.kitchen_vendor_id,
      qty: l.qty ? String(l.qty) : '',
      piece_count: l.piece_count === null ? '' : String(l.piece_count),
      unit_id: l.unit_id,
      unit_label: items.find((i) => i.id === l.item_id)?.unit_label ?? null,
      notes: l.notes ?? '',
    })),
  )
  const [search, setSearch] = useState('')
  const [error, setError]   = useState<string | null>(null)

  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors])
  const chosen = useMemo(() => new Set(lines.map((l) => l.item_id).filter(Boolean)), [lines])
  const searchIndex = useMemo(() => buildSearchIndex(items), [items])
  const matches = useMemo(
    () => searchItems(items, searchIndex, search, { exclude: chosen }),
    [search, items, searchIndex, chosen],
  )

  // Grouped by vendor, same as the requisition sheet — it's the same list, and
  // seeing it the way it will be ordered is how you spot a missing supplier.
  const grouped = useMemo(() => {
    const map = new Map<string, { vendor: KitchenVendor | null; idx: number[] }>()
    lines.forEach((l, i) => {
      const key = l.kitchen_vendor_id ?? '_untagged'
      const cur = map.get(key) ?? {
        vendor: l.kitchen_vendor_id ? vendorById.get(l.kitchen_vendor_id) ?? null : null, idx: [],
      }
      cur.idx.push(i)
      map.set(key, cur)
    })
    return [...map.entries()].sort((a, b) => {
      if (a[0] === '_untagged') return 1
      if (b[0] === '_untagged') return -1
      return (a[1].vendor?.sort_order ?? 0) - (b[1].vendor?.sort_order ?? 0)
    })
  }, [lines, vendorById])

  function addItem(it: PickerItemRow) {
    setLines((prev) => [...prev, {
      item_id: it.id, item_name: it.name,
      kitchen_vendor_id: it.kitchen_vendor_id,
      qty: '', piece_count: '', unit_id: it.unit_id, unit_label: it.unit_label, notes: '',
    }])
    setSearch('')
  }
  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i))
  }

  function submit() {
    setError(null)
    start(async () => {
      const r = await safeCall(() => saveTemplate({
        name, description: description || null, is_active: isActive,
        lines: lines.map((l, i) => ({
          sort_order: i,
          item_id: l.item_id, item_name: l.item_name,
          kitchen_vendor_id: l.kitchen_vendor_id,
          qty: Number(l.qty) || 0,
          piece_count: l.piece_count === '' ? null : Number(l.piece_count),
          unit_id: l.unit_id, notes: l.notes || null,
        })),
      }, templateId))
      if (!r.success) { setError(r.error); return }
      toast.success(templateId ? 'Template saved' : `"${name}" created`)
      router.push('/kitchen/templates')
    })
  }

  return (
    <div className="mx-auto w-full max-w-[720px] space-y-4 pb-28">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-800">
            Name <span className="text-red-500">*</span>
          </span>
          <input
            value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Standard day"
            className="min-h-[44px] w-full rounded-xl border border-gray-300 px-3 text-base"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-800">When to use it</span>
          <input
            value={description} onChange={(e) => setDesc(e.target.value)}
            placeholder="e.g. under 60 guests"
            className="min-h-[44px] w-full rounded-xl border border-gray-300 px-3 text-base"
          />
        </label>
      </div>

      <button
        type="button" onClick={() => setActive((v) => !v)}
        className={cn('flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-3 text-sm font-medium',
          isActive ? 'border-gray-300 bg-white text-gray-700' : 'border-amber-400 bg-amber-50 text-amber-800')}
      >
        {isActive ? <Eye size={15} /> : <EyeOff size={15} />}
        {isActive ? 'Shown when starting a requisition' : 'Hidden — kept, but not offered'}
      </button>

      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search — English or Bangla typed in English (tel, alu)…"
            className="min-h-[44px] w-full rounded-xl border border-gray-300 pl-9 pr-3 text-base focus:border-forest-500 focus:outline-none"
          />
        </div>
        {matches.length > 0 && (
          <ul className="mt-2 space-y-1">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button" onClick={() => addItem(m)}
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-forest-50"
                >
                  <Plus size={14} className="flex-shrink-0 text-forest-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-gray-900">{m.name}</span>
                    <span className="block text-[11px] text-gray-500">
                      {m.kitchen_vendor_id
                        ? vendorById.get(m.kitchen_vendor_id)?.display_name ?? 'Unknown vendor'
                        : <span className="text-red-600">No vendor set</span>}
                      {m.unit_label ? ` · ${m.unit_label}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {lines.length === 0 ? (
        <p className="rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          Nothing on this template yet — search above to build the standing list.
        </p>
      ) : grouped.map(([key, g]) => (
        <div key={key} className={cn('overflow-hidden rounded-xl border bg-white',
          key === '_untagged' ? 'border-red-300' : 'border-gray-200')}>
          <p className={cn('border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide',
            key === '_untagged'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-gray-200 bg-gray-50 text-gray-600')}>
            {g.vendor?.display_name ?? 'No vendor — these won’t reach any supplier'}
          </p>
          <div className="divide-y divide-gray-100">
            {g.idx.map((i) => {
              const l = lines[i]
              return (
                <div key={i} className="flex items-center gap-2 p-3">
                  <span className="min-w-0 flex-1 text-sm text-gray-900">{l.item_name}</span>
                  <label className="flex-shrink-0">
                    <span className="sr-only">Normal quantity</span>
                    <input
                      inputMode="decimal" value={l.qty}
                      onChange={(e) => setLine(i, { qty: e.target.value.replace(/[^0-9.]/g, '') })}
                      placeholder="0"
                      className="min-h-[42px] w-[84px] rounded-lg border border-gray-300 px-2 text-right text-base"
                    />
                  </label>
                  <span className="w-8 flex-shrink-0 text-xs text-gray-500">{l.unit_label ?? ''}</span>
                  <button
                    type="button" onClick={() => removeLine(i)}
                    aria-label={`Remove ${l.item_name}`}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-red-500"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <p className="px-1 text-[11px] leading-relaxed text-gray-500">
        Quantities are the normal-day figure. They get pre-filled into the requisition and
        adjusted there against the headcount, so a rough number is worth much more than a
        blank one.
      </p>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {templateId && (
        <button
          type="button"
          disabled={pending}
          onClick={async () => {
            const ok = await confirm({
              title: `Delete "${initial?.name ?? 'this template'}"?`,
              description: 'Requisitions already built from it are unaffected — lines are copied, never linked.',
              confirmLabel: 'Delete', danger: true,
            })
            if (!ok) return
            start(async () => {
              const r = await safeCall(() => deleteTemplate(templateId))
              if (!r.success) { toast.error(r.error); return }
              toast.success('Template deleted')
              router.push('/kitchen/templates')
            })
          }}
          className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 text-xs font-medium text-red-600"
        >
          <Trash2 size={13} /> Delete this template
        </button>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto max-w-[720px]">
          <button
            type="button" onClick={submit}
            disabled={pending || !name.trim() || lines.length === 0}
            className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-forest-700 text-base font-semibold text-white disabled:opacity-50"
          >
            <Save size={17} />
            {pending ? 'Saving…' : `Save · ${lines.length} item${lines.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
