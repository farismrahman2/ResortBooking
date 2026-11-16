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

import { accountStatement, subProjectBudget, withSubProjects } from './money'

describe('sub-projects and accounts', () => {
  const asu = { contract: 5000000, variations: [100000], receipts: [1000000], bills: [], billPayments: [], expenses: [20000] }
  const parking = { contract: 1500000, variations: [], receipts: [], bills: [939750], billPayments: [500000], expenses: [45000] }
  const restaurant = { contract: 800000, variations: [], receipts: [50000], bills: [92400], billPayments: [92400], expenses: [] }
  it('main project includes every sub-project, but not their budgets as contract', () => {
    const f = withSubProjects(asu, [parking, restaurant])
    expect(f.contractTotal).toBe(5100000)
    expect(f.received).toBe(1050000)
    expect(f.spent).toBe(20000 + 939750 + 45000 + 92400)
    expect(f.billsUnpaid).toBe(439750)
  })
  it('a sub-project is measured against its own budget', () => {
    expect(subProjectBudget(1500000, 984750)).toEqual({ budget: 1500000, spent: 984750, remaining: 515250, usedPct: 65.7, overBudget: false })
    expect(subProjectBudget(800000, 900000).overBudget).toBe(true)
  })
  it('account statement runs a balance, money in first on the same day', () => {
    const a = accountStatement([
      { date: '2026-11-11', direction: 'out', amount: 300000, label: 'Al-Baraka bill 225' },
      { date: '2026-11-10', direction: 'in', amount: 1000000, label: 'Client payment' },
      { date: '2026-11-11', direction: 'in', amount: 50000, label: 'Restaurant takings' },
      { date: '2026-11-12', direction: 'out', amount: 4500, label: 'Labour' },
    ])
    expect(a.lines.map((l) => l.balance)).toEqual([1000000, 1050000, 750000, 745500])
    expect(a).toMatchObject({ totalIn: 1050000, totalOut: 304500, balance: 745500 })
  })
})

describe('past paper slips', () => {
  it('entering old slip numbers does not move new numbering backwards', () => {
    expect(nextReqNo(20)).toBe(33)      // old 00020 entered: new slips still start at 00033
    expect(nextReqNo(32)).toBe(33)
    expect(nextReqNo(41)).toBe(42)
  })
  it('a past slip with one paid bill reads as fully paid', () => {
    expect(requisitionSpend(257000, [{ amount: 257000, paid: 257000 }])).toMatchObject({ billed: 257000, paid: 257000, unpaid: 0, overBudget: false })
  })
})
