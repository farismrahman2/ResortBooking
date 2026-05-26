'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { recordMaintenance } from '@/lib/actions/fixed-assets'
import type { MaintenanceFormInput } from '@/lib/validators/fixed-assets'
import type { FaMaintenanceLog, MaintenanceType } from '@/lib/supabase/types-fixed-assets'
import { MAINTENANCE_TYPE_LABELS } from './labels'
import { formatBDT } from '@/lib/formatters/currency'

interface Opt { id: string; name: string }

export function MaintenancePanel({ assetId, log, vendors, canWrite }: { assetId: string; log: FaMaintenanceLog[]; vendors: Opt[]; canWrite: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    maintenance_date: today, maintenance_type: 'preventive' as MaintenanceType, description: '',
    vendor_id: '', technician_name: '', cost: '', create_expense: false, next_service_date: '', notes: '',
  })
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })) }

  function submit() {
    setError(null)
    const payload: MaintenanceFormInput = {
      asset_id: assetId, maintenance_date: form.maintenance_date, maintenance_type: form.maintenance_type,
      description: form.description.trim(), vendor_id: form.vendor_id || null, technician_name: form.technician_name.trim() || null,
      cost: form.cost === '' ? 0 : Number(form.cost), create_expense: form.create_expense,
      next_service_date: form.next_service_date || null, notes: form.notes.trim() || null,
    }
    startTransition(async () => {
      const res = await recordMaintenance(payload)
      if (!res.success) { setError(res.error); return }
      setOpen(false); router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {canWrite && !open && <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus size={14} className="mr-1" /> Log maintenance</Button>}
      {canWrite && open && (
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Select label="Type" value={form.maintenance_type} onChange={(e) => set('maintenance_type', e.target.value as MaintenanceType)}
              options={Object.entries(MAINTENANCE_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
            <Input label="Date" type="date" value={form.maintenance_date} onChange={(e) => set('maintenance_date', e.target.value)} />
          </div>
          <Input label="Description" required value={form.description} onChange={(e) => set('description', e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Vendor" value={form.vendor_id} onChange={(e) => set('vendor_id', e.target.value)}>
              <option value="">—</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            <Input label="Technician" value={form.technician_name} onChange={(e) => set('technician_name', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Cost (BDT)" type="number" min="0" value={form.cost} onChange={(e) => set('cost', e.target.value)} />
            <Input label="Next service" type="date" value={form.next_service_date} onChange={(e) => set('next_service_date', e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.create_expense} onChange={(e) => set('create_expense', e.target.checked)} className="accent-zinc-600" />
            Create an expense for this maintenance cost
          </label>
          <Textarea label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" onClick={submit} loading={pending} disabled={!form.description.trim()}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {log.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">No maintenance logged.</p>
      ) : (
        <div className="space-y-2">
          {log.map((m) => (
            <div key={m.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{MAINTENANCE_TYPE_LABELS[m.maintenance_type]} — {m.description}</span>
                <span className="tabular-nums text-gray-600">{m.cost > 0 ? formatBDT(m.cost) : '—'}</span>
              </div>
              <p className="mt-0.5 text-xs text-gray-400">
                {m.maintenance_date}{m.technician_name ? ` · ${m.technician_name}` : ''}
                {m.next_service_date ? ` · next: ${m.next_service_date}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
