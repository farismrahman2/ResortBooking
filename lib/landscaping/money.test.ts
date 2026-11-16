import { describe, expect, it } from 'vitest'
import {
  billStatus, canActOnRequisition, floatBalance, formatReqNo, lineAmount, nextReqNo,
  projectFinancials, requisitionSpend, requisitionTotal, supplierBalance,
} from './money'

describe('landscaping money', () => {
  it('requisition 00026 totals Tk 9,39,750 (from the paper slip)', () => {
    const items = [
      { qty: 2500, unit_price: 130 }, { qty: 7, unit_price: 5000 },
      { qty: 500, unit_price: 540 }, { qty: 3500, unit_price: 88.5 },
    ]
    expect(lineAmount(items[3])).toBe(309750)
    expect(requisitionTotal(items)).toBe(939750)
  })
  it('bills: unpaid, part paid, paid', () => {
    expect(billStatus(60000, 0)).toBe('unpaid')
    expect(billStatus(60000, 20000)).toBe('part_paid')
    expect(billStatus(60000, 60000)).toBe('paid')
  })
  it('flags bills over the approved requisition', () => {
    const s = requisitionSpend(92400, [{ amount: 60000, paid: 60000 }, { amount: 40000, paid: 0 }])
    expect(s).toMatchObject({ billed: 100000, paid: 60000, unpaid: 40000, overBudget: true, overBy: 7600 })
    expect(requisitionSpend(92400, [{ amount: 92400, paid: 0 }]).overBudget).toBe(false)
  })
  it('cash float = given − returned − spent', () => {
    expect(floatBalance({ given: [50000, 20000], returned: [5000], paidBills: [30000], expenses: [8000, 1500] }))
      .toEqual({ given: 70000, returned: 5000, spent: 39500, balance: 25500 })
  })
  it('project profit with variations and client payments', () => {
    const f = projectFinancials({ contract: 2000000, variations: [150000, -50000], receipts: [800000],
      bills: [939750, 92400], billPayments: [500000], expenses: [45000] })
    expect(f.contractTotal).toBe(2100000)
    expect(f.owedByClient).toBe(1300000)
    expect(f.spent).toBe(1077150)
    expect(f.profit).toBe(1022850)
    expect(f.margin).toBe(48.7)
    expect(f.billsUnpaid).toBe(532150)
  })
  it('supplier ledger carries opening dues', () => {
    expect(supplierBalance(15000, [60000], [20000]).owed).toBe(55000)
  })
  it('numbering continues after the paper slips', () => {
    expect(nextReqNo(null)).toBe(33)
    expect(nextReqNo(40)).toBe(41)
    expect(formatReqNo(26)).toBe('00026')
  })
  it('nobody checks or approves their own requisition', () => {
    const me = { user_id: 'u1', can_check: true, can_approve: true, is_admin: false }
    expect(canActOnRequisition('check', { status: 'submitted', prepared_by: 'u1' }, me).ok).toBe(false)
    expect(canActOnRequisition('check', { status: 'submitted', prepared_by: 'u2' }, me).ok).toBe(true)
    expect(canActOnRequisition('approve', { status: 'checked', prepared_by: 'u2', checked_by: 'u1' }, me).ok).toBe(false)
    expect(canActOnRequisition('approve', { status: 'checked', prepared_by: 'u2', checked_by: 'u3' }, me).ok).toBe(true)
    expect(canActOnRequisition('approve', { status: 'submitted', prepared_by: 'u2' }, me).ok).toBe(false)
  })
})
