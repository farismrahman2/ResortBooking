'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Save } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { NumberInput } from '@/components/ui/NumberInput'
import { Button } from '@/components/ui/Button'
import {
  createLeaveType,
  updateLeaveType,
  toggleLeaveTypeActive,
} from '@/lib/actions/leaves'
import type { LeaveTypeRow } from '@/lib/supabase/types'

interface Props {
  rows: LeaveTypeRow[]
}

interface DraftRow {
  id?:                     string
  name:                    string
  slug:                    string
  default_annual_balance:  number
  is_paid:                 boolean
  display_order:           number
  is_active:               boolean
  /** UI-only flag — true when the row was loaded from server, false for new */
  isNew?:                  boolean
}

function fromRow(r: LeaveTypeRow): DraftRow {
  return {
    id:                     r.id,
    name:                   r.name,
    slug:                   r.slug,
    default_annual_balance: Number(r.default_annual_balance),
    is_paid:                r.is_paid,
    display_order:          r.display_order,
    is_active:              r.is_active,
  }
}

export function LeaveTypeManager({ rows }: Props) {
  const router  = useRouter()
  const [pending, startTransition] = useTransition()
  const [drafts, setDrafts] = useState<DraftRow[]>(rows.map(fromRow))
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  function patch(idx: number, p: Partial<DraftRow>) {
    setDrafts((prev) => prev.map((r, i) => (i === idx ? { ...r, ...p } : r)))
  }

  function addRow() {
    const maxOrder = drafts.reduce((m, r) => Math.max(m, r.display_order), 0)
    setDrafts((prev) => [
      ...prev,
      {
        name: '', slug: '', default_annual_balance: 0,
        is_paid: true, display_order: maxOrder + 1, is_active: true, isNew: true,
      },
    ])
  }

  function removeNew(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx))
  }

  function save(idx: number) {
    setError(null); setSavedAt(null)
    const r = drafts[idx]
    if (!r.name.trim() || !r.slug.trim()) {
      setError('Name and slug are required.')
      return
    }
    setSavingId(r.id ?? `new-${idx}`)
    startTransition(async () => {
      const payload = {
        name:                   r.name,
        slug:                   r.slug,
        default_annual_balance: r.default_annual_balance,
        is_paid:                r.is_paid,
        display_order:          r.display_order,
        is_active:              r.is_active,
      }
      const result = r.id
        ? await updateLeaveType(r.id, payload)
        : await createLeaveType(payload)
      setSavingId(null)
      if (!result.success) { setError(result.error); return }
      setSavedAt(new Date().toLocaleTimeString())
      router.refresh()
    })
  }

  function toggleActive(id: string) {
    startTransition(async () => {
      const result = await toggleLeaveTypeActive(id)
      if (!result.success) { setError(result.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}
      {savedAt && !error && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          Saved at {savedAt}.
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Slug</th>
                <th className="px-3 py-2 text-right font-medium">Days / Year</th>
                <th className="px-3 py-2 font-medium">Paid?</th>
                <th className="px-3 py-2 text-right font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Active</th>
                <th className="px-3 py-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {drafts.map((r, idx) => (
                <tr key={r.id ?? `new-${idx}`}>
                  <td className="px-3 py-2 align-top">
                    <Input
                      value={r.name}
                      onChange={(e) => patch(idx, { name: e.target.value })}
                      placeholder="e.g. Maternity Leave"
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <Input
                      value={r.slug}
                      onChange={(e) => patch(idx, { slug: e.target.value })}
                      placeholder="e.g. maternity"
                      disabled={!r.isNew}
                      hint={!r.isNew ? 'Slug is locked once saved' : 'lowercase, digits, _'}
                    />
                  </td>
                  <td className="px-3 py-2 align-top w-32">
                    <NumberInput
                      value={r.default_annual_balance}
                      onChange={(v) => patch(idx, { default_annual_balance: v })}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={r.is_paid}
                        onChange={(e) => patch(idx, { is_paid: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-sky-600"
                      />
                      Paid
                    </label>
                  </td>
                  <td className="px-3 py-2 align-top w-24">
                    <NumberInput
                      value={r.display_order}
                      onChange={(v) => patch(idx, { display_order: v })}
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    {r.id ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggleActive(r.id!)}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                          r.is_active
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-gray-100 text-gray-500 border-gray-300'
                        }`}
                      >
                        {r.is_active ? 'Active' : 'Inactive'}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">— (saves as active)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        loading={pending && savingId === (r.id ?? `new-${idx}`)}
                        onClick={() => save(idx)}
                      >
                        <Save size={12} /> Save
                      </Button>
                      {r.isNew && (
                        <button
                          type="button"
                          onClick={() => removeNew(idx)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                          title="Discard"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <Button type="button" variant="outline" size="md" onClick={addRow} className="gap-1.5">
          <Plus size={14} />
          Add Leave Type
        </Button>
      </div>

      <p className="text-xs text-gray-500">
        Once a leave type has been used (referenced from <code>leave_balances</code> or <code>attendance</code>),
        the slug is locked. Set <em>Inactive</em> to retire a type without breaking historical references.
        New leave types are picked up by the next <strong>Initialize Year</strong> run.
      </p>
    </div>
  )
}
