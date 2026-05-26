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
