/**
 * Row types for the Corporate Sales CRM module. Kept separate from
 * lib/supabase/types.ts so the core types file doesn't grow further.
 */

export type AccountStatus = 'target' | 'contacted' | 'existing' | 'lapsed' | 'won_client' | 'lost'
export type TierSlug      = 'a' | 'b' | 'c'
export type Department    =
  | 'hr' | 'l_and_d' | 'admin' | 'procurement' | 'csr'
  | 'marketing' | 'operations' | 'finance' | 'other'

export interface CrmSector {
  id:            string
  slug:          string
  display_name:  string
  display_order: number
  is_active:     boolean
}

export interface CrmTier {
  id:                   string
  slug:                 TierSlug
  display_name:         string
  default_discount_pct: number
  description:          string | null
  display_order:        number
}

export interface CrmAccount {
  id:                string
  account_code:      string
  parent_account_id: string | null
  company_name:      string
  sector_id:         string | null
  tier_id:           string | null
  hq_location:       string | null
  branch_presence:   string | null
  approx_employees:  number | null
  status:            AccountStatus
  owner_user_id:     string | null
  last_engaged_at:   string | null
  next_action:       string | null
  notes:             string | null
  is_active:         boolean
  created_by:        string | null
  created_at:        string
  updated_at:        string
}

export interface CrmContact {
  id:              string
  account_id:      string
  full_name:       string
  designation:     string | null
  department:      Department | null
  email:           string | null
  phone:           string | null
  whatsapp:        string | null
  office_location: string | null
  is_primary:      boolean
  linkedin_url:    string | null
  notes:           string | null
  is_active:       boolean
  created_at:      string
  updated_at:      string
}

/** Account joined with sector, tier, owner name, primary contact, parent, child count. */
export interface CrmAccountWithRelations extends CrmAccount {
  sector:          Pick<CrmSector, 'slug' | 'display_name'> | null
  tier:            Pick<CrmTier, 'slug' | 'display_name' | 'default_discount_pct'> | null
  owner_name:      string | null
  primary_contact: Pick<CrmContact, 'id' | 'full_name' | 'designation' | 'phone'> | null
  parent:          Pick<CrmAccount, 'id' | 'company_name'> | null
  children_count:  number
}

// ─── Opportunities + Activities (Phase 2) ─────────────────────────────────────

export type OpportunityStage =
  | 'prospect' | 'contacted' | 'meeting_scheduled' | 'meeting_done'
  | 'site_inspection' | 'proposal_sent' | 'negotiation' | 'won' | 'lost' | 'on_hold'

export type EventType    = 'training' | 'conference' | 'retreat' | 'day_use' | 'agm' | 'team_outing' | 'other'
export type LostReason   = 'price' | 'competition' | 'went_with_inhouse' | 'postponed' | 'no_budget' | 'no_decision' | 'lost_contact' | 'other'
export type ActivityType = 'call' | 'email' | 'whatsapp' | 'meeting' | 'site_visit' | 'proposal_sent' | 'field_visit' | 'linkedin' | 'other'
export type ActivityOutcome = 'positive' | 'neutral' | 'negative'

export interface CrmOpportunity {
  id:                  string
  opp_code:            string
  account_id:          string
  primary_contact_id:  string | null
  owner_user_id:       string | null
  opportunity_name:    string
  event_type:          EventType
  stage:               OpportunityStage
  probability_pct:     number
  pax:                 number | null
  est_value:           number
  weighted_value:      number
  expected_event_date: string | null
  proposed_rate_card:  string | null
  next_action:         string | null
  won_at:              string | null
  actual_value:        number | null
  linked_booking_id:   string | null
  lost_at:             string | null
  lost_reason:         LostReason | null
  lost_notes:          string | null
  hold_resume_date:    string | null
  notes:               string | null
  is_active:           boolean
  created_by:          string | null
  created_at:          string
  updated_at:          string
}

export interface CrmOpportunityWithRelations extends CrmOpportunity {
  account:         Pick<CrmAccount, 'id' | 'company_name' | 'account_code'> | null
  primary_contact: Pick<CrmContact, 'id' | 'full_name' | 'phone'> | null
  owner_name:      string | null
}

export interface CrmActivity {
  id:               string
  account_id:       string
  opportunity_id:   string | null
  contact_id:       string | null
  activity_type:    ActivityType
  activity_date:    string
  duration_minutes: number | null
  subject:          string
  notes:            string | null
  outcome:          ActivityOutcome | null
  next_step:        string | null
  next_step_date:   string | null
  logged_by:        string
  created_at:       string
}

export interface CrmActivityWithRelations extends CrmActivity {
  account_name: string | null
  contact_name: string | null
  logged_by_name: string | null
}

export interface PipelineColumn {
  stage:          OpportunityStage
  opportunities:  CrmOpportunityWithRelations[]
  count:          number
  total_value:    number
  weighted_value: number
}
