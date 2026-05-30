import type { CheckoutPaymentMethod, CheckoutStatus } from '@/lib/supabase/types'

export const CHECKOUT_PAYMENT_METHOD_LABELS: Record<CheckoutPaymentMethod, string> = {
  cash:           'Cash',
  bkash:          'bKash',
  card:           'Card',
  bank_transfer:  'Bank Transfer',
  other:          'Other',
}

export const CHECKOUT_PAYMENT_METHOD_OPTIONS: { value: CheckoutPaymentMethod; label: string }[] = (
  ['cash','bkash','card','bank_transfer','other'] as CheckoutPaymentMethod[]
).map((m) => ({ value: m, label: CHECKOUT_PAYMENT_METHOD_LABELS[m] }))

export const CHECKOUT_STATUS_LABELS: Record<CheckoutStatus, string> = {
  draft:     'Draft',
  finalized: 'Finalized',
  voided:    'Voided',
}

export const CHECKOUT_STATUS_BADGE: Record<CheckoutStatus, string> = {
  draft:     'bg-amber-50 text-amber-700 border-amber-200',
  finalized: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  voided:    'bg-gray-100 text-gray-600 border-gray-300',
}

export const CHARGE_CATEGORY_BADGE: Record<string, string> = {
  food:     'bg-orange-50 text-orange-700 border-orange-200',
  beverage: 'bg-sky-50 text-sky-700 border-sky-200',
  damage:   'bg-rose-50 text-rose-700 border-rose-200',
  service:  'bg-violet-50 text-violet-700 border-violet-200',
  misc:     'bg-gray-100 text-gray-700 border-gray-200',
}
