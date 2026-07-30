// ─── Field Visits (Form GCR-CS-01 Rev 4.0) ──────────────────────────────────
// Paper field codes are noted per field — they are the contract between the
// printed form and this schema. See migrations/field-visits-module/000_*.sql.

export type FieldVisitStatus   = 'draft' | 'submitted' | 'processed' | 'void'
export type VisitType          = 'cold_visit' | 'appointment' | 'follow_up' | 'referral'
export type InterestLevel      = 'hot' | 'warm' | 'cold'

/** Editable lookup row (employee bands / budget bands). */
export interface FieldVisitBand {
  id:         string
  code:       string
  label:      string
  sort_order: number
  is_active:  boolean
}

export interface FieldVisitContact {
  id:                string
  visit_id:          string
  sort_order:        number
  name:              string | null
  designation:       string | null
  department:        string | null
  mobile:            string | null
  email:             string | null
  is_decision_maker: boolean
  is_active:         boolean
  created_at:        string
}

export interface FieldVisitVenue {
  id:               string
  visit_id:         string
  sort_order:       number
  venue_name:       string | null
  event_month_year: string | null
  pax:              number | null
  rate_per_head:    number | null
  feedback:         string | null
  is_active:        boolean
  created_at:       string
}

export interface FieldVisitRow {
  id:        string
  visit_ref: string
  status:    FieldVisitStatus

  // A — Visit
  visit_date:         string | null
  sales_executive_id: string | null
  territory_zone:     string | null
  visit_type:         VisitType | null   // VIS.01

  // B — Organisation
  organisation_name: string | null       // ORG.01
  office_address:    string | null       // ORG.02
  sector_id:         string | null       // ORG.03
  employee_band:     string | null       // ORG.04

  // C — Contacts context
  decision_signoff:  string[]            // CON.04
  best_time_to_call: string | null       // CON.05
  preferred_channel: string[]            // CON.06

  // D — Requirements
  event_types:          string[]         // REQ.01
  events_per_year:      string | null    // REQ.02
  typical_headcount:    string | null    // REQ.03
  event_format:         string[]         // REQ.04
  preferred_day:        string[]         // REQ.05
  budget_per_head_band: string | null    // REQ.06
  rooms_needed:         number | null    // REQ.07
  annual_event_spend:   number | null    // REQ.08
  peak_months:          string[]         // REQ.09
  transport:            string[]         // REQ.10

  // F — Outcome
  interest_level:     InterestLevel | null // OUT.01
  materials_given:    string[]             // OUT.02
  next_event_month:   string | null        // OUT.03
  next_event_type:    string | null        // OUT.04
  next_event_pax:     number | null        // OUT.05
  next_step:          string[]             // OUT.06
  due_by:             string | null        // OUT.07
  follow_up_owner_id: string | null        // OUT.08

  // CRM handoff
  account_id:      string | null
  pipeline_stage:  string | null
  discount_tier:   'a' | 'b' | 'c' | null
  crm_activity_id: string | null
  processed_by:    string | null
  processed_at:    string | null

  gps_lat:      number | null
  gps_lng:      number | null
  submitted_at: string | null
  void_reason:  string | null

  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FieldVisitWithChildren extends FieldVisitRow {
  contacts: FieldVisitContact[]
  venues:   FieldVisitVenue[]
}

/** Decorated for the list page — joined display names. */
export interface FieldVisitListRow extends FieldVisitRow {
  sales_executive_name: string | null
  sector_name:          string | null
  account_name:         string | null
  contact_count:        number
}

export interface FieldVisitFilters {
  from?:          string
  to?:            string
  executiveId?:   string
  interestLevel?: InterestLevel
  status?:        FieldVisitStatus
  sectorId?:      string
  overdueOnly?:   boolean
  search?:        string
}

// ─── Option sets (paper form) ───────────────────────────────────────────────
// These are the printed form's fixed tick-boxes. Unlike sectors/bands they are
// part of the form's layout, so they live in code, not the DB.

export const VISIT_TYPE_OPTIONS: { value: VisitType; label: string }[] = [
  { value: 'cold_visit',  label: 'Cold visit' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'follow_up',   label: 'Follow-up' },
  { value: 'referral',    label: 'Referral' },
]

export const EVENT_TYPE_OPTIONS = [
  'Annual picnic', 'Conference / seminar', 'Training / workshop', 'Team building',
  'Product launch', 'AGM / board meeting', 'Family day', 'Award night',
  'Retreat / offsite', 'Client entertainment', 'Iftar / religious', 'Other',
] as const

export const EVENT_FORMAT_OPTIONS  = ['Daylong', 'Overnight', 'Multi-day', 'Residential'] as const
export const PREFERRED_DAY_OPTIONS = ['Weekday', 'Friday', 'Saturday', 'Flexible'] as const
export const DECISION_SIGNOFF_OPTIONS = [
  'HR', 'Admin', 'Management / CEO', 'Procurement', 'Finance', 'Department head',
] as const
export const CHANNEL_OPTIONS   = ['Phone', 'WhatsApp', 'Email', 'In person'] as const
export const TRANSPORT_OPTIONS = ['Own transport', 'Rented bus', 'Resort to arrange', 'Not decided'] as const
export const MONTH_OPTIONS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** OUT.02 — `nothing` is mutually exclusive with the other two. */
export const MATERIALS_OPTIONS: { value: string; label: string }[] = [
  { value: 'visiting_card', label: 'Visiting card' },
  { value: 'brochure',      label: 'Brochure' },
  { value: 'nothing',       label: 'Nothing' },
]

export const NEXT_STEP_OPTIONS = [
  'Send proposal', 'Schedule site inspection', 'Follow-up call', 'Send brochure',
  'Meet decision maker', 'Await their event calendar', 'No further action',
] as const

export const INTEREST_OPTIONS: { value: InterestLevel; label: string; tone: string }[] = [
  { value: 'hot',  label: 'Hot',  tone: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'warm', label: 'Warm', tone: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'cold', label: 'Cold', tone: 'bg-sky-100 text-sky-800 border-sky-300' },
]

export const FIELD_VISIT_STATUS_LABELS: Record<FieldVisitStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', processed: 'Processed', void: 'Void',
}

export const FIELD_VISIT_STATUS_BADGE: Record<FieldVisitStatus, string> = {
  draft:     'bg-gray-100 text-gray-700 border-gray-300',
  submitted: 'bg-amber-100 text-amber-800 border-amber-300',
  processed: 'bg-green-100 text-green-800 border-green-300',
  void:      'bg-red-50 text-red-500 border-red-200',
}
