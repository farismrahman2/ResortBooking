import type { CoffeeShopPaymentMethod } from '@/lib/supabase/types-coffee-shop'

export const PAYMENT_METHOD_LABELS: Record<CoffeeShopPaymentMethod, string> = {
  cash:          'Cash',
  bkash:         'bKash',
  nagad:         'Nagad',
  rocket:        'Rocket',
  card:          'Card',
  bank_transfer: 'Bank transfer',
  other:         'Other',
}

export const PAYMENT_METHOD_BADGE: Record<CoffeeShopPaymentMethod, string> = {
  cash:          'bg-emerald-100 text-emerald-800 border-emerald-200',
  bkash:         'bg-pink-100   text-pink-800   border-pink-200',
  nagad:         'bg-orange-100 text-orange-800 border-orange-200',
  rocket:        'bg-purple-100 text-purple-800 border-purple-200',
  card:          'bg-sky-100    text-sky-800    border-sky-200',
  bank_transfer: 'bg-slate-100  text-slate-700  border-slate-200',
  other:         'bg-gray-100   text-gray-700   border-gray-200',
}

export const STATUS_BADGE: Record<'completed' | 'voided', string> = {
  completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  voided:    'bg-rose-100    text-rose-800    border-rose-200',
}
