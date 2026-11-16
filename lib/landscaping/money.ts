/**
 * LANDSCAPING — money rules, kept pure so every screen and report agrees.
 *
 *   requisition (approved budget) → supplier bills → payments (full or part)
 *   cash float: given − returned − cash paid out (bills + expenses)
 *   project:    contract + variations − client receipts = still owed;
 *               spent = bills + direct expenses; profit = contract − spent
 */

const r2 = (n: number) => Math.round(n * 100) / 100
const sum = (xs: number[]) => r2(xs.reduce((s, x) => s + Number(x || 0), 0))

export interface ItemLine { qty: number; unit_price: number }
export const lineAmount = (l: ItemLine) => r2(Number(l.qty) * Number(l.unit_price))
export const requisitionTotal = (items: ItemLine[]) => sum(items.map(lineAmount))

export type BillStatus = 'unpaid' | 'part_paid' | 'paid'
export function billStatus(amount: number, paid: number): BillStatus {
  if (paid <= 0) return 'unpaid'
  return paid + 0.005 >= amount ? 'paid' : 'part_paid'
}

/** Approved vs. billed vs. paid for one requisition. */
export function requisitionSpend(approved: number, bills: Array<{ amount: number; paid: number }>) {
  const billed = sum(bills.map((b) => b.amount))
  const paid = sum(bills.map((b) => b.paid))
  return {
    approved: r2(approved), billed, paid,
    unpaid: r2(billed - paid),
    remainingBudget: r2(approved - billed),
    overBudget: billed > approved + 0.005,
    overBy: r2(Math.max(0, billed - approved)),
  }
}

/** What an accountant should be holding. */
export function floatBalance(m: { given: number[]; returned: number[]; paidBills: number[]; expenses: number[] }) {
  const given = sum(m.given), returned = sum(m.returned)
  const spent = r2(sum(m.paidBills) + sum(m.expenses))
  return { given, returned, spent, balance: r2(given - returned - spent) }
}

/** One project's figures. */
export function projectFinancials(p: {
  contract: number; variations: number[]; receipts: number[]
  bills: number[]; billPayments: number[]; expenses: number[]
}) {
  const contractTotal = r2(Number(p.contract) + sum(p.variations))
  const received = sum(p.receipts)
  const billed = sum(p.bills), expenses = sum(p.expenses)
  const spent = r2(billed + expenses)
  const profit = r2(contractTotal - spent)
  return {
    contractTotal, received,
    owedByClient: r2(contractTotal - received),
    billed, billsPaid: sum(p.billPayments), billsUnpaid: r2(billed - sum(p.billPayments)),
    expenses, spent, profit,
    margin: contractTotal > 0 ? Math.round((profit / contractTotal) * 1000) / 10 : null,
    spentPct: contractTotal > 0 ? Math.round((spent / contractTotal) * 1000) / 10 : null,
    cashPosition: r2(received - sum(p.billPayments) - expenses),
  }
}

/** A supplier's ledger: opening dues + bills − payments. */
export function supplierBalance(opening: number, bills: number[], payments: number[]) {
  const billed = sum(bills), paid = sum(payments)
  return { opening: r2(opening), billed, paid, owed: r2(Number(opening) + billed - paid) }
}

/** Next requisition number: one past the highest used, never below the paper slips' run. */
export const nextReqNo = (highestUsed: number | null, paperStart = 33) => Math.max(paperStart, (highestUsed ?? 0) + 1)
export const formatReqNo = (n: number) => String(n).padStart(5, '0')

/** Who may act on a requisition at its current step — never on your own. */
export function canActOnRequisition(
  step: 'check' | 'approve',
  req: { status: string; prepared_by: string | null; checked_by?: string | null },
  me: { user_id: string; can_check: boolean; can_approve: boolean; is_admin: boolean },
): { ok: true } | { ok: false; reason: string } {
  if (req.prepared_by && req.prepared_by === me.user_id) return { ok: false, reason: 'You prepared this requisition — someone else must check and approve it.' }
  if (step === 'check') {
    if (req.status !== 'submitted') return { ok: false, reason: 'Only a submitted requisition can be checked.' }
    if (!me.can_check && !me.is_admin) return { ok: false, reason: 'You are not set as a checker.' }
    return { ok: true }
  }
  if (req.status !== 'checked') return { ok: false, reason: 'A requisition must be checked before it is approved.' }
  if (req.checked_by && req.checked_by === me.user_id) return { ok: false, reason: 'You checked this one — a different person must approve it.' }
  if (!me.can_approve && !me.is_admin) return { ok: false, reason: 'You are not set as an approver.' }
  return { ok: true }
}
