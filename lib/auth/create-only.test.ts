import { describe, expect, it } from 'vitest'
import { canSeeRecord, isCreateOnlyRole, maskDuplicates } from './create-only'

describe('create-only (Corporate Sales) rules', () => {
  const sales = { user_id: 'u1', roleSlug: 'corporate_sales' }
  it('only corporate_sales is create-only', () => {
    expect(isCreateOnlyRole('corporate_sales')).toBe(true)
    for (const r of ['admin', 'reservation', 'front_desk', 'inventory', null, undefined]) expect(isCreateOnlyRole(r)).toBe(false)
  })
  it('sales see only what they created', () => {
    expect(canSeeRecord(sales, 'u1')).toBe(true)
    expect(canSeeRecord(sales, 'u2')).toBe(false)
    expect(canSeeRecord(sales, null)).toBe(false)            // made before tracking began
  })
  it('everyone else sees every record', () => {
    expect(canSeeRecord({ user_id: 'u9', roleSlug: 'reservation' }, 'u1')).toBe(true)
    expect(canSeeRecord({ user_id: 'u9', roleSlug: 'admin' }, null)).toBe(true)
  })
  it('duplicate warnings hide the other booking for sales', () => {
    const row = { id: 'b1', number: 'GCR-B-1', customer_name: 'X', customer_phone: '017', total: 9000, visit_date: '2026-11-05' }
    expect(maskDuplicates([row], 'corporate_sales')[0]).toEqual({ ...row, id: '', number: '—', customer_name: '', customer_phone: '', total: 0 })
    expect(maskDuplicates([row], 'reservation')[0]).toBe(row)
  })
})
