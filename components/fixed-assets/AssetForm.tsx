'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createAsset, updateAsset } from '@/lib/actions/fixed-assets'
import type { AssetFormInput } from '@/lib/validators/fixed-assets'
import type { FaCategory, FaLocation, FaAsset, AssetCondition } from '@/lib/supabase/types-fixed-assets'
import { CONDITION_LABELS } from './labels'

interface Opt { id: string; name: string }
interface Props {
  categories: FaCategory[]
  locations:  FaLocation[]
  vendors:    Opt[]
  custodians: Opt[]
  asset?:     FaAsset
}

export function AssetForm({ categories, locations, vendors, custodians, asset }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    name:                    asset?.name ?? '',
    category_id:             asset?.category_id ?? categories[0]?.id ?? '',
    description:             asset?.description ?? '',
    brand:                   asset?.brand ?? '',
    model_number:            asset?.model_number ?? '',
    serial_number:           asset?.serial_number ?? '',
    acquisition_date:        asset?.acquisition_date ?? today,
    acquisition_cost:        asset?.acquisition_cost != null ? String(asset.acquisition_cost) : '',
    vendor_id:               asset?.vendor_id ?? '',
    invoice_number:          asset?.invoice_number ?? '',
    warranty_until:          asset?.warranty_until ?? '',
    useful_life_years:       asset?.useful_life_years != null ? String(asset.useful_life_years) : String(categories[0]?.default_useful_life_years ?? 10),
    salvage_value:           asset?.salvage_value != null ? String(asset.salvage_value) : '',
    depreciation_start_date: asset?.depreciation_start_date ?? today,
    location_id:             asset?.location_id ?? '',
    location_notes:          asset?.location_notes ?? '',
    custodian_employee_id:   asset?.custodian_employee_id ?? '',
    condition:               (asset?.condition ?? 'good') as AssetCondition,
    notes:                   asset?.notes ?? '',
  })
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })) }

  // Auto-fill useful life + salvage from category defaults (skip in edit mode unless category changes)
  function onCategory(catId: string) {
    const cat = categories.find((c) => c.id === catId)
    setForm((f) => {
      const cost = Number(f.acquisition_cost) || 0
      const salvage = cat ? Math.round(cost * Number(cat.default_salvage_pct)) / 100 : 0
      return {
        ...f, category_id: catId,
        useful_life_years: cat ? String(cat.default_useful_life_years) : f.useful_life_years,
        salvage_value: cost > 0 ? String(salvage) : f.salvage_value,
      }
    })
  }
  function onCost(v: string) {
    setForm((f) => {
      const cat = categories.find((c) => c.id === f.category_id)
      const cost = Number(v) || 0
      const salvage = cat ? Math.round(cost * Number(cat.default_salvage_pct)) / 100 : Number(f.salvage_value) || 0
      return { ...f, acquisition_cost: v, salvage_value: String(salvage) }
    })
  }

  function submit() {
    setError(null)
    const payload: AssetFormInput = {
      name:                    form.name.trim(),
      category_id:             form.category_id,
      description:             form.description.trim() || null,
      brand:                   form.brand.trim() || null,
      model_number:            form.model_number.trim() || null,
      serial_number:           form.serial_number.trim() || null,
      acquisition_date:        form.acquisition_date,
      acquisition_cost:        Number(form.acquisition_cost),
      vendor_id:               form.vendor_id || null,
      invoice_number:          form.invoice_number.trim() || null,
      warranty_until:          form.warranty_until || null,
      useful_life_years:       Number(form.useful_life_years),
      salvage_value:           form.salvage_value === '' ? 0 : Number(form.salvage_value),
      depreciation_start_date: form.depreciation_start_date,
      location_id:             form.location_id || null,
      location_notes:          form.location_notes.trim() || null,
      custodian_employee_id:   form.custodian_employee_id || null,
      condition:               form.condition,
      notes:                   form.notes.trim() || null,
    }
    startTransition(async () => {
      const res = asset ? await updateAsset(asset.id, payload) : await createAsset(payload)
      if (!res.success) { setError(res.error); return }
      router.push(asset ? `/fixed-assets/assets/${asset.id}` : '/fixed-assets/assets')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <Input label="Name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Category" required value={form.category_id} onChange={(e) => onCategory(e.target.value)}
          options={categories.map((c) => ({ value: c.id, label: c.display_name }))} />
        <Select label="Condition" value={form.condition} onChange={(e) => set('condition', e.target.value as AssetCondition)}
          options={Object.entries(CONDITION_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input label="Brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
        <Input label="Model #" value={form.model_number} onChange={(e) => set('model_number', e.target.value)} />
        <Input label="Serial #" value={form.serial_number} onChange={(e) => set('serial_number', e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Acquisition date" type="date" required value={form.acquisition_date} onChange={(e) => set('acquisition_date', e.target.value)} />
        <Input label="Acquisition cost (BDT)" type="number" min="0" required value={form.acquisition_cost} onChange={(e) => onCost(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Vendor" value={form.vendor_id} onChange={(e) => set('vendor_id', e.target.value)}>
          <option value="">—</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <Input label="Invoice #" value={form.invoice_number} onChange={(e) => set('invoice_number', e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input label="Useful life (years)" type="number" min="1" value={form.useful_life_years} onChange={(e) => set('useful_life_years', e.target.value)} />
        <Input label="Salvage value (BDT)" type="number" min="0" value={form.salvage_value} onChange={(e) => set('salvage_value', e.target.value)} hint="Auto from category %" />
        <Input label="Depreciation start" type="date" value={form.depreciation_start_date} onChange={(e) => set('depreciation_start_date', e.target.value)} />
      </div>
      <Input label="Warranty until" type="date" value={form.warranty_until} onChange={(e) => set('warranty_until', e.target.value)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Location" value={form.location_id} onChange={(e) => set('location_id', e.target.value)}>
          <option value="">—</option>
          {locations.map((l) => <option key={l.id} value={l.id}>{l.display_name}</option>)}
        </Select>
        <Select label="Custodian" value={form.custodian_employee_id} onChange={(e) => set('custodian_employee_id', e.target.value)}>
          <option value="">—</option>
          {custodians.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      <Input label="Location notes" value={form.location_notes} onChange={(e) => set('location_notes', e.target.value)} hint="e.g. Room 204" />
      <Textarea label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
      <div className="flex gap-2 pt-1">
        <Button onClick={submit} loading={pending} disabled={!form.name.trim() || !form.category_id || !form.acquisition_cost}>
          {asset ? 'Save changes' : 'Create asset'}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  )
}
