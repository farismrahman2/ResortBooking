'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/permissions'
import {
  assetFormSchema, maintenanceFormSchema, disposalFormSchema,
  type AssetFormInput, type MaintenanceFormInput, type DisposalFormInput,
} from '@/lib/validators/fixed-assets'
import { formatAssetTag } from '@/lib/fixed-assets/asset-tag'
import { computeDepreciation } from '@/lib/fixed-assets/depreciation'
import type { ActionResult, ActionData } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

async function currentUserId(): Promise<string | null> {
  const { data } = await createClient().auth.getUser()
  return data.user?.id ?? null
}

type FaEntity = 'fa_asset' | 'fa_maintenance' | 'fa_audit'
async function logHistory(entity: FaEntity, id: string, event: 'created' | 'edited', payload: Record<string, unknown> = {}) {
  try {
    const { error } = await dbc().from('history_log').insert({ entity_type: entity, entity_id: id, event, actor: 'system', payload })
    if (error) console.warn(`[history_log] non-fatal: ${error.message}`)
  } catch (err) { console.warn('[history_log] non-fatal:', err) }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function faExpenseCategoryId(db: any): Promise<string | null> {
  const { data } = await db.from('expense_categories').select('id').eq('slug', 'fixed_asset_purchases').maybeSingle()
  return data?.id ?? null
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export async function createAsset(raw: AssetFormInput): Promise<ActionData<{ id: string; asset_tag: string }>> {
  await requirePermission('fixed_assets', 'write')
  try {
    const input = assetFormSchema.parse(raw)
    const db = dbc()
    const userId = await currentUserId()

    let created: { id: string; asset_tag: string } | null = null
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      let tag = input.asset_tag?.trim()
      if (!tag) {
        const { count } = await db.from('fa_assets').select('id', { count: 'exact', head: true })
        tag = formatAssetTag((count ?? 0) + attempt)
      }
      const { data, error } = await db.from('fa_assets').insert({
        asset_tag:               tag,
        name:                    input.name,
        category_id:             input.category_id,
        description:             input.description ?? null,
        brand:                   input.brand ?? null,
        model_number:            input.model_number ?? null,
        serial_number:           input.serial_number ?? null,
        acquisition_date:        input.acquisition_date,
        acquisition_cost:        input.acquisition_cost,
        vendor_id:               input.vendor_id ?? null,
        invoice_number:          input.invoice_number ?? null,
        warranty_until:          input.warranty_until ?? null,
        useful_life_years:       input.useful_life_years,
        salvage_value:           input.salvage_value ?? 0,
        depreciation_start_date: input.depreciation_start_date,
        location_id:             input.location_id ?? null,
        location_notes:          input.location_notes ?? null,
        custodian_employee_id:   input.custodian_employee_id ?? null,
        condition:               input.condition,
        notes:                   input.notes ?? null,
        created_by:              userId,
      }).select('id, asset_tag').single()
      if (!error) { created = data; break }
      if (error.code !== '23505' || input.asset_tag) return { success: false, error: error.message }
    }
    if (!created) return { success: false, error: 'Could not generate a unique asset tag' }

    // Capitalize → expense row (bidirectional link, mirror of inventory receipt)
    const catId = await faExpenseCategoryId(db)
    if (catId) {
      const { data: expense } = await db.from('expenses').insert({
        expense_date:   input.acquisition_date,
        category_id:    catId,
        payee_id:       input.vendor_id ?? null,
        amount:         input.acquisition_cost,
        payment_method: 'cash',
        description:    `Fixed asset: ${input.name} (${created.asset_tag})`,
        notes:          `Auto-created from fixed asset ${created.asset_tag}`,
        is_draft:       false,
        source_module:  'fixed_assets',
        source_id:      created.id,
        created_by:     userId,
      }).select('id').single()
      if (expense?.id) await db.from('fa_assets').update({ expense_id: expense.id }).eq('id', created.id)
    }

    await logHistory('fa_asset', created.id, 'created', { asset_tag: created.asset_tag, name: input.name, cost: input.acquisition_cost })
    revalidatePath('/fixed-assets')
    revalidatePath('/fixed-assets/assets')
    revalidatePath('/expenses')
    return { success: true, data: created }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateAsset(id: string, raw: AssetFormInput): Promise<ActionResult> {
  await requirePermission('fixed_assets', 'write')
  try {
    const input = assetFormSchema.parse(raw)
    const db = dbc()
    const { data: existing } = await db.from('fa_assets').select('expense_id, acquisition_cost').eq('id', id).maybeSingle()

    const update: Record<string, unknown> = {
      name:                    input.name,
      category_id:             input.category_id,
      description:             input.description ?? null,
      brand:                   input.brand ?? null,
      model_number:            input.model_number ?? null,
      serial_number:           input.serial_number ?? null,
      acquisition_date:        input.acquisition_date,
      acquisition_cost:        input.acquisition_cost,
      vendor_id:               input.vendor_id ?? null,
      invoice_number:          input.invoice_number ?? null,
      warranty_until:          input.warranty_until ?? null,
      useful_life_years:       input.useful_life_years,
      salvage_value:           input.salvage_value ?? 0,
      depreciation_start_date: input.depreciation_start_date,
      location_id:             input.location_id ?? null,
      location_notes:          input.location_notes ?? null,
      custodian_employee_id:   input.custodian_employee_id ?? null,
      condition:               input.condition,
      notes:                   input.notes ?? null,
      updated_at:              new Date().toISOString(),
    }
    if (input.asset_tag?.trim()) update.asset_tag = input.asset_tag.trim()
    const { error } = await db.from('fa_assets').update(update).eq('id', id)
    if (error) return { success: false, error: error.message }

    // Keep the linked capitalized expense in sync with cost.
    if (existing?.expense_id && Number(existing.acquisition_cost) !== input.acquisition_cost) {
      await db.from('expenses').update({ amount: input.acquisition_cost, updated_at: new Date().toISOString() }).eq('id', existing.expense_id)
    }

    await logHistory('fa_asset', id, 'edited', { name: input.name })
    revalidatePath('/fixed-assets')
    revalidatePath(`/fixed-assets/assets/${id}`)
    revalidatePath('/expenses')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function transferAsset(id: string, newLocationId: string | null, notes?: string): Promise<ActionResult> {
  await requirePermission('fixed_assets', 'write')
  try {
    const db = dbc()
    const { data: prev } = await db.from('fa_assets').select('location_id').eq('id', id).maybeSingle()
    const { error } = await db.from('fa_assets').update({
      location_id: newLocationId, location_notes: notes ?? null, updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory('fa_asset', id, 'edited', { action: 'transferred', from: prev?.location_id ?? null, to: newLocationId })
    revalidatePath(`/fixed-assets/assets/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function assignCustodian(id: string, employeeId: string | null): Promise<ActionResult> {
  await requirePermission('fixed_assets', 'write')
  try {
    const { error } = await dbc().from('fa_assets').update({ custodian_employee_id: employeeId, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory('fa_asset', id, 'edited', { action: 'custodian_assigned', to: employeeId })
    revalidatePath(`/fixed-assets/assets/${id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateCondition(id: string, condition: string, notes?: string): Promise<ActionResult> {
  await requirePermission('fixed_assets', 'write')
  try {
    const { error } = await dbc().from('fa_assets').update({ condition, updated_at: new Date().toISOString(), ...(notes ? { notes } : {}) }).eq('id', id)
    if (error) return { success: false, error: error.message }
    await logHistory('fa_asset', id, 'edited', { action: 'condition_changed', to: condition })
    revalidatePath(`/fixed-assets/assets/${id}`)
    revalidatePath('/fixed-assets/assets')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function disposeAsset(raw: DisposalFormInput): Promise<ActionResult> {
  await requirePermission('fixed_assets', 'write')
  try {
    const input = disposalFormSchema.parse(raw)
    const db = dbc()
    const { data: a } = await db.from('fa_assets').select('*').eq('id', input.asset_id).maybeSingle()
    if (!a) return { success: false, error: 'Asset not found' }
    if (a.status !== 'active') return { success: false, error: 'Asset is already disposed' }

    const nbv = computeDepreciation({
      acquisitionCost:       Number(a.acquisition_cost),
      salvageValue:          Number(a.salvage_value),
      usefulLifeYears:       a.useful_life_years,
      depreciationStartDate: new Date(a.depreciation_start_date + 'T00:00:00'),
      asOfDate:              new Date(input.disposal_date + 'T00:00:00'),
    }).netBookValue
    const proceeds = input.disposal_proceeds ?? 0
    const gainLoss = Math.round((proceeds - nbv) * 100) / 100

    const status = input.disposal_method === 'lost' ? 'lost' : 'disposed'
    const { error } = await db.from('fa_assets').update({
      status, disposal_date: input.disposal_date, disposal_method: input.disposal_method,
      disposal_proceeds: input.disposal_proceeds ?? null, disposal_notes: input.disposal_notes ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', input.asset_id)
    if (error) return { success: false, error: error.message }

    await logHistory('fa_asset', input.asset_id, 'edited', {
      action: 'disposed', method: input.disposal_method, proceeds, nbv, gain_loss: gainLoss,
    })
    revalidatePath('/fixed-assets')
    revalidatePath(`/fixed-assets/assets/${input.asset_id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Maintenance ────────────────────────────────────────────────────────────

export async function recordMaintenance(raw: MaintenanceFormInput): Promise<ActionData<{ id: string }>> {
  await requirePermission('fixed_assets', 'write')
  try {
    const input = maintenanceFormSchema.parse(raw)
    const db = dbc()
    const userId = await currentUserId()

    let expenseId: string | null = null
    if (input.create_expense && input.cost > 0) {
      const catId = await faExpenseCategoryId(db)
      if (catId) {
        const { data: exp } = await db.from('expenses').insert({
          expense_date:   input.maintenance_date,
          category_id:    catId,
          payee_id:       input.vendor_id ?? null,
          amount:         input.cost,
          payment_method: 'cash',
          description:    `Asset maintenance: ${input.description}`,
          notes:          'Auto-created from fixed-asset maintenance',
          is_draft:       false,
          source_module:  'fixed_assets',
          source_id:      input.asset_id,
          created_by:     userId,
        }).select('id').single()
        expenseId = exp?.id ?? null
      }
    }

    const { data, error } = await db.from('fa_maintenance_log').insert({
      asset_id:          input.asset_id,
      maintenance_date:  input.maintenance_date,
      maintenance_type:  input.maintenance_type,
      description:       input.description,
      vendor_id:         input.vendor_id ?? null,
      technician_name:   input.technician_name ?? null,
      cost:              input.cost ?? 0,
      expense_id:        expenseId,
      next_service_date: input.next_service_date ?? null,
      outcome:           input.outcome ?? null,
      notes:             input.notes ?? null,
      created_by:        userId,
    }).select('id').single()
    if (error) { if (expenseId) await db.from('expenses').delete().eq('id', expenseId); return { success: false, error: error.message } }

    await logHistory('fa_maintenance', data.id, 'created', { asset_id: input.asset_id, type: input.maintenance_type, cost: input.cost })
    revalidatePath(`/fixed-assets/assets/${input.asset_id}`)
    revalidatePath('/fixed-assets/maintenance')
    if (expenseId) revalidatePath('/expenses')
    return { success: true, data: { id: data.id } }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Settings ───────────────────────────────────────────────────────────────

export async function updateAssetCategory(id: string, input: { default_useful_life_years: number; default_salvage_pct: number; description: string | null }): Promise<ActionResult> {
  await requirePermission('settings', 'write')
  try {
    if (input.default_useful_life_years <= 0) return { success: false, error: 'Useful life must be > 0' }
    if (input.default_salvage_pct < 0 || input.default_salvage_pct > 100) return { success: false, error: 'Salvage % must be 0–100' }
    const { error } = await dbc().from('fa_categories').update({
      default_useful_life_years: input.default_useful_life_years,
      default_salvage_pct:       input.default_salvage_pct,
      description:               input.description,
    }).eq('id', id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/settings/asset-categories')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
