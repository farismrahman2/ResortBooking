import type { AccountStatus, Department, TierSlug } from '@/lib/supabase/types-crm'

export const STATUS_LABELS: Record<AccountStatus, string> = {
  target:     'Target',
  contacted:  'Contacted',
  existing:   'Existing',
  lapsed:     'Lapsed',
  won_client: 'Won Client',
  lost:       'Lost',
}

export const STATUS_BADGE: Record<AccountStatus, string> = {
  target:     'bg-gray-100 text-gray-700',
  contacted:  'bg-blue-50 text-blue-700',
  existing:   'bg-indigo-50 text-indigo-700',
  lapsed:     'bg-amber-50 text-amber-700',
  won_client: 'bg-emerald-50 text-emerald-700',
  lost:       'bg-red-50 text-red-700',
}

export const TIER_BADGE: Record<TierSlug, string> = {
  a: 'bg-amber-100 text-amber-800 border-amber-300',
  b: 'bg-sky-100 text-sky-800 border-sky-300',
  c: 'bg-stone-100 text-stone-700 border-stone-300',
}

export const DEPARTMENT_LABELS: Record<Department, string> = {
  hr:          'HR',
  l_and_d:     'L&D',
  admin:       'Admin',
  procurement: 'Procurement',
  csr:         'CSR',
  marketing:   'Marketing',
  operations:  'Operations',
  finance:     'Finance',
  other:       'Other',
}
