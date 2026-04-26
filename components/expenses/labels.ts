import type { ExpenseCategoryGroup, PayeeType, PaymentMethod } from '@/lib/supabase/types'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash:           'Cash',
  bkash:          'bKash',
  nagad:          'Nagad',
  rocket:         'Rocket',
  bank_transfer:  'Bank Transfer',
  cheque:         'Cheque',
  other:          'Other',
}

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = (
  ['cash', 'bkash', 'nagad', 'rocket', 'bank_transfer', 'cheque', 'other'] as PaymentMethod[]
).map((m) => ({ value: m, label: PAYMENT_METHOD_LABELS[m] }))

export const PAYEE_TYPE_LABELS: Record<PayeeType, string> = {
  supplier:   'Supplier',
  contractor: 'Contractor',
  staff:      'Staff',
  utility:    'Utility',
  other:      'Other',
}

export const PAYEE_TYPE_OPTIONS: { value: PayeeType; label: string }[] = (
  ['supplier', 'contractor', 'staff', 'utility', 'other'] as PayeeType[]
).map((t) => ({ value: t, label: PAYEE_TYPE_LABELS[t] }))

export const CATEGORY_GROUP_LABELS: Record<ExpenseCategoryGroup, string> = {
  bazar:         'Bazar / Supplies',
  beverages:     'Beverages',
  utilities:     'Utilities',
  maintenance:   'Maintenance',
  salary:        'Salary',
  services:      'Services',
  materials:     'Materials',
  miscellaneous: 'Miscellaneous',
}

export const CATEGORY_GROUP_OPTIONS: { value: ExpenseCategoryGroup; label: string }[] = (
  ['bazar', 'beverages', 'utilities', 'maintenance', 'salary', 'services', 'materials', 'miscellaneous'] as ExpenseCategoryGroup[]
).map((g) => ({ value: g, label: CATEGORY_GROUP_LABELS[g] }))

/** Tailwind class snippets for category-group badges (small, consistent palette) */
export const CATEGORY_GROUP_BADGE: Record<ExpenseCategoryGroup, string> = {
  bazar:         'bg-rose-50 text-rose-700 border-rose-200',
  beverages:     'bg-sky-50 text-sky-700 border-sky-200',
  utilities:     'bg-amber-50 text-amber-700 border-amber-200',
  maintenance:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  salary:        'bg-indigo-50 text-indigo-700 border-indigo-200',
  services:      'bg-purple-50 text-purple-700 border-purple-200',
  materials:     'bg-orange-50 text-orange-700 border-orange-200',
  miscellaneous: 'bg-gray-100 text-gray-700 border-gray-200',
}
