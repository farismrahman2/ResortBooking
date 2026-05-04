import type { LucideIcon } from 'lucide-react'
import {
  Banknote, BarChart3, Briefcase, Calendar, Coins, Hammer,
  Hotel, ListChecks, PieChart, Receipt, ScrollText, TrendingUp, Users,
} from 'lucide-react'

export type ReportSection =
  | 'income'
  | 'expenses'
  | 'profitability'
  | 'operations'
  | 'hr'
  | 'checkout'
  | 'weekly'

export interface ReportMeta {
  id:          string
  title:       string
  description: string
  href:        string
  section:     ReportSection
  icon:        LucideIcon
  /** When set, the tile is greyed out unless this module is at least 'read'. */
  module?:     'hr' | 'checkout' | 'expenses' | 'reports'
  /** Phase the report ships in — used to hide/grey unimplemented tiles. */
  phase:       1 | 2 | 3 | 4
}

export const REPORTS: ReportMeta[] = [
  // Income
  { id: 'income',                 title: 'Income overview',     description: 'Revenue trends across rooms + extras',           href: '/reports/income',                  section: 'income',        icon: TrendingUp, phase: 1 },
  { id: 'income-by-package',      title: 'Revenue by package',  description: 'Room type / package performance',                href: '/reports/income/by-package',       section: 'income',        icon: Hotel,      phase: 1 },
  { id: 'income-by-day-of-week',  title: 'Day-of-week pattern', description: 'Weekday vs weekend revenue + occupancy',         href: '/reports/income/by-day-of-week',   section: 'income',        icon: Calendar,   phase: 1 },

  // Expenses & P&L
  { id: 'expenses',               title: 'Expense overview',    description: 'Spend trends + category split',                  href: '/reports/expenses',                section: 'expenses',      icon: Receipt,    module: 'expenses', phase: 1 },
  { id: 'budget-vs-actual',       title: 'Budget vs actual',    description: 'Variance per category',                          href: '/reports/expenses/budget-vs-actual', section: 'expenses',    icon: BarChart3,  module: 'expenses', phase: 1 },
  { id: 'profitability',          title: 'Profitability',       description: 'Top-line P&L, monthly breakdown',                href: '/reports/profitability',           section: 'profitability', icon: Coins,      phase: 1 },
  { id: 'cash-position',          title: 'Cash position',       description: 'Running balance over time',                      href: '/reports/profitability/cash-position', section: 'profitability', icon: Banknote, phase: 1 },

  // Operations
  { id: 'operations',             title: 'Operations',          description: 'Occupancy heatmap + pickup pace',                href: '/reports/operations',              section: 'operations',    icon: PieChart,   phase: 1 },

  // HR
  { id: 'hr-salary-vs-revenue',   title: 'Salary % of revenue', description: 'Payroll cost relative to income',                href: '/reports/hr/salary-vs-revenue',    section: 'hr',            icon: Briefcase, module: 'hr', phase: 1 },
  { id: 'hr-attendance',          title: 'Attendance trends',   description: 'Department breakdown + top absentees',           href: '/reports/hr/attendance',           section: 'hr',            icon: Users,     module: 'hr', phase: 1 },
  { id: 'hr-loan-exposure',       title: 'Loan exposure',       description: 'Outstanding loans + aging buckets',              href: '/reports/hr/loan-exposure',        section: 'hr',            icon: ScrollText, module: 'hr', phase: 1 },

  // Checkout
  { id: 'checkout-extras',        title: 'Extras revenue',      description: 'F&B + ancillary spend per guest',                href: '/reports/checkout/extras-revenue', section: 'checkout',      icon: ListChecks, module: 'checkout', phase: 1 },
  { id: 'checkout-top-items',     title: 'Top-selling items',   description: 'Most-popular charge items by revenue',           href: '/reports/checkout/top-items',      section: 'checkout',      icon: Hammer,     module: 'checkout', phase: 1 },
  { id: 'checkout-by-room-type',  title: 'Extras by room type', description: 'Which room types upsell more',                   href: '/reports/checkout/by-room-type',   section: 'checkout',      icon: Hotel,      module: 'checkout', phase: 1 },

  // Weekly
  { id: 'weekly',                 title: 'Weekly summary',      description: 'Last week at a glance + anomaly callouts',       href: '/reports/weekly',                  section: 'weekly',        icon: BarChart3,  phase: 1 },
]

export const SECTION_LABELS: Record<ReportSection, string> = {
  income:        'Income',
  expenses:      'Expenses & P&L',
  profitability: 'Profitability',
  operations:    'Operations',
  hr:            'HR & Payroll',
  checkout:      'Checkout & Extras',
  weekly:        'Weekly summary',
}

export const SECTION_ORDER: ReportSection[] = [
  'income', 'expenses', 'profitability', 'operations', 'hr', 'checkout', 'weekly',
]
