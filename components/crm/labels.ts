import type { AccountStatus, Department, TierSlug, EventType, ActivityType, LostReason, OpportunityStage } from '@/lib/supabase/types-crm'

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

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  training:    'Training',
  conference:  'Conference',
  retreat:     'Retreat',
  day_use:     'Day Use',
  agm:         'AGM',
  team_outing: 'Team Outing',
  other:       'Other',
}

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  call:          'Call',
  email:         'Email',
  whatsapp:      'WhatsApp',
  meeting:       'Meeting',
  site_visit:    'Site Visit',
  proposal_sent: 'Proposal Sent',
  field_visit:   'Field Visit',
  linkedin:      'LinkedIn',
  other:         'Other',
}

export const LOST_REASON_LABELS: Record<LostReason, string> = {
  price:             'Price',
  competition:       'Competition',
  went_with_inhouse: 'Went in-house',
  postponed:         'Postponed',
  no_budget:         'No budget',
  no_decision:       'No decision',
  lost_contact:      'Lost contact',
  other:             'Other',
}

export const STAGE_COLUMN_TINT: Record<OpportunityStage, string> = {
  prospect:          'border-t-gray-300',
  contacted:         'border-t-blue-300',
  meeting_scheduled: 'border-t-blue-400',
  meeting_done:      'border-t-indigo-400',
  site_inspection:   'border-t-violet-400',
  proposal_sent:     'border-t-amber-400',
  negotiation:       'border-t-orange-400',
  won:               'border-t-emerald-500',
  lost:              'border-t-red-400',
  on_hold:           'border-t-stone-400',
}
