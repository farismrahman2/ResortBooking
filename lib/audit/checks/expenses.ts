import { daysBetween, finding, type Finding } from '../types'

export interface AuditExpense {
  id: string; expense_date: string; amount: number; payment_method: string | null
  category_id: string | null; category_name: string | null; payee_id: string | null; payee_name: string | null
  description: string | null; is_draft: boolean; created_at: string; attachments: number
}
export interface AuditBudget { category_id: string; category_name: string; amount: number }
export interface AuditTemplate { id: string; name: string; day_of_month: number; is_active: boolean; last_generated_for: string | null }

const taka = (n: number) => `৳${Math.round(n).toLocaleString('en-IN')}`
const ex = (e: AuditExpense, detail: string) => ({
  ref: `${e.expense_date} · ${e.payee_name ?? e.category_name ?? 'Expense'}`, detail, link: `/expenses/${e.id}`,
})
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }

/** Large expenses without a receipt — over this many taka. */
export const RECEIPT_THRESHOLD = 10000

export function checkExpenses(input: {
  expenses: AuditExpense[]; budgets: AuditBudget[]; templates: AuditTemplate[]; today: string
}): Finding[] {
  const { budgets, templates, today } = input
  const real = input.expenses.filter((e) => !e.is_draft)
  const recent = real.filter((e) => daysBetween(e.expense_date, today) <= 60)
  const monthStart = `${today.slice(0, 7)}-01`
  const out: Array<Finding | null> = []

  // Same payee, same amount, same day — usually entered twice.
  const groups = new Map<string, AuditExpense[]>()
  for (const e of recent) {
    if (!e.payee_id) continue
    const k = `${e.payee_id}|${e.amount}|${e.expense_date}`
    groups.set(k, [...(groups.get(k) ?? []), e])
  }
  const dupes = [...groups.values()].filter((g) => g.length > 1)
  out.push(finding({ id: 'expense-duplicate', area: 'expenses', severity: 'high', title: 'Possible duplicate expenses (same payee, amount and day)' },
    dupes.map((g) => ex(g[0], `${g.length} × ${taka(g[0].amount)}`)),
    dupes.reduce((s, g) => s + g[0].amount * (g.length - 1), 0)))

  const noReceipt = recent.filter((e) => e.amount >= RECEIPT_THRESHOLD && e.attachments === 0)
  out.push(finding({ id: 'expense-no-receipt', area: 'expenses', severity: 'medium', title: `Expenses of ${taka(RECEIPT_THRESHOLD)} or more with no receipt attached (last 60 days)` },
    noReceipt.map((e) => ex(e, `${taka(e.amount)} · ${e.category_name ?? 'uncategorised'}`)), noReceipt.reduce((s, e) => s + e.amount, 0)))

  out.push(finding({ id: 'expense-uncategorised', area: 'expenses', severity: 'low', title: 'Expenses with no category' },
    recent.filter((e) => !e.category_id).map((e) => ex(e, taka(e.amount)))))

  out.push(finding({ id: 'expense-late-entry', area: 'expenses', severity: 'low', title: 'Expenses entered more than 14 days after they happened (last 30 days)' },
    real.filter((e) => daysBetween(e.created_at, today) <= 30 && daysBetween(e.expense_date, e.created_at) > 14)
      .map((e) => ex(e, `entered ${daysBetween(e.expense_date, e.created_at)} days later · ${taka(e.amount)}`))))

  // Cash spends far above what that category normally costs.
  const cashByCat = new Map<string, number[]>()
  for (const e of real.filter((x) => x.payment_method === 'cash' && daysBetween(x.expense_date, today) <= 90)) {
    if (e.category_id) cashByCat.set(e.category_id, [...(cashByCat.get(e.category_id) ?? []), e.amount])
  }
  const unusual = recent.filter((e) => {
    if (e.payment_method !== 'cash' || !e.category_id) return false
    const xs = cashByCat.get(e.category_id) ?? []
    return xs.length >= 5 && e.amount > 3 * median(xs) && e.amount >= 5000
  })
  out.push(finding({ id: 'expense-unusual-cash', area: 'expenses', severity: 'medium', title: 'Cash payments much larger than usual for their category' },
    unusual.map((e) => ex(e, `${taka(e.amount)} vs usual ~${taka(median(cashByCat.get(e.category_id!) ?? []))}`)), unusual.reduce((s, e) => s + e.amount, 0)))

  out.push(finding({ id: 'expense-old-drafts', area: 'expenses', severity: 'low', title: 'Draft expenses older than 7 days — finish or delete them (Expenses → Drafts)' },
    input.expenses.filter((e) => e.is_draft && daysBetween(e.created_at, today) > 7).map((e) => ex(e, taka(e.amount)))))

  // Budgets: over, or none set at all.
  if (budgets.length === 0) {
    out.push({ id: 'expense-no-budgets', area: 'expenses', severity: 'low', title: 'No monthly expense budgets are set — over-spending can\'t be flagged', count: 1,
      examples: [{ ref: 'Expense budgets', detail: 'Set a budget per category', link: '/expenses/budgets' }] })
  } else {
    const spent = new Map<string, number>()
    for (const e of real.filter((x) => x.expense_date >= monthStart)) if (e.category_id) spent.set(e.category_id, (spent.get(e.category_id) ?? 0) + e.amount)
    const over = budgets.filter((b) => (spent.get(b.category_id) ?? 0) > b.amount)
    out.push(finding({ id: 'expense-over-budget', area: 'expenses', severity: 'high', title: 'Categories over their budget this month' },
      over.map((b) => ({ ref: b.category_name, detail: `${taka(spent.get(b.category_id) ?? 0)} of ${taka(b.amount)}`, link: '/expenses/analytics' })),
      over.reduce((s, b) => s + (spent.get(b.category_id) ?? 0) - b.amount, 0)))
  }

  const day = Number(today.slice(8, 10))
  out.push(finding({ id: 'expense-recurring-missed', area: 'expenses', severity: 'medium', title: 'Recurring expenses that should have posted this month but haven\'t' },
    templates.filter((t) => t.is_active && t.day_of_month < day && (!t.last_generated_for || t.last_generated_for < monthStart))
      .map((t) => ({ ref: t.name, detail: `due on day ${t.day_of_month}`, link: '/expenses' }))))

  return out.filter((f): f is Finding => f !== null)
}
