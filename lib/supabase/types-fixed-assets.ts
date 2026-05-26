/** Row types for the Fixed Assets module. */

export type AssetCondition  = 'excellent' | 'good' | 'fair' | 'poor' | 'needs_repair' | 'out_of_service'
export type AssetStatus     = 'active' | 'disposed' | 'lost' | 'stolen'
export type DisposalMethod  = 'sold' | 'scrapped' | 'donated' | 'traded_in' | 'lost' | 'written_off'
export type MaintenanceType = 'preventive' | 'corrective' | 'inspection' | 'warranty' | 'amc' | 'installation' | 'upgrade' | 'other'
export type MaintenanceOutcome = 'resolved' | 'pending' | 'requires_replacement' | 'warranty_claim'
export type LocationType    = 'guest_room' | 'common_area' | 'kitchen' | 'restaurant' | 'office' | 'laundry' | 'storage' | 'outdoor' | 'plant_room' | 'vehicle' | 'staff_quarters' | 'other'

export interface FaCategory {
  id:                        string
  slug:                      string
  display_name:              string
  default_useful_life_years: number
  default_salvage_pct:       number
  description:               string | null
  display_order:             number
  is_active:                 boolean
}

export interface FaLocation {
  id:                 string
  slug:               string
  display_name:       string
  location_type:      LocationType
  parent_location_id: string | null
  is_active:          boolean
  display_order:      number
}

export interface FaAsset {
  id:                      string
  asset_tag:               string
  name:                    string
  category_id:             string
  description:             string | null
  brand:                   string | null
  model_number:            string | null
  serial_number:           string | null
  acquisition_date:        string
  acquisition_cost:        number
  vendor_id:               string | null
  invoice_number:          string | null
  warranty_until:          string | null
  expense_id:              string | null
  useful_life_years:       number
  salvage_value:           number
  depreciation_start_date: string
  location_id:             string | null
  location_notes:          string | null
  custodian_employee_id:   string | null
  condition:               AssetCondition
  status:                  AssetStatus
  disposal_date:           string | null
  disposal_method:         DisposalMethod | null
  disposal_proceeds:       number | null
  disposal_notes:          string | null
  photos:                  string[] | null
  notes:                   string | null
  is_active:               boolean
  created_by:              string | null
  created_at:              string
  updated_at:              string
}

export interface FaMaintenanceLog {
  id:                string
  asset_id:          string
  maintenance_date:  string
  maintenance_type:  MaintenanceType
  description:       string
  vendor_id:         string | null
  technician_name:   string | null
  cost:              number
  expense_id:        string | null
  next_service_date: string | null
  outcome:           MaintenanceOutcome | null
  notes:             string | null
  created_by:        string | null
  created_at:        string
}

export interface DepreciationResult {
  monthlyDepreciation:   number
  monthsElapsed:         number
  totalDepreciation:     number
  netBookValue:          number
  remainingUsefulMonths: number
  isFullyDepreciated:    boolean
}

export interface FaAssetWithRelations extends FaAsset {
  category:       Pick<FaCategory, 'slug' | 'display_name'> | null
  location:       Pick<FaLocation, 'slug' | 'display_name'> | null
  custodian_name: string | null
  vendor_name:    string | null
  depreciation:   DepreciationResult
}

// ─── Audit (Phase 3) ───────────────────────────────────────────────────────────

export type AuditStatus = 'in_progress' | 'finalized' | 'cancelled'

export interface FaAudit {
  id:           string
  audit_number: string
  audit_year:   number
  status:       AuditStatus
  started_at:   string
  finalized_at: string | null
  conducted_by: string | null
  notes:        string | null
}

export interface FaAuditLine {
  id:                   string
  audit_id:             string
  asset_id:             string
  expected_location_id: string | null
  found:                boolean | null
  found_at_location_id: string | null
  found_condition:      AssetCondition | null
  variance_notes:       string | null
  verified_at:          string | null
  verified_by:          string | null
}

export interface FaAuditLineWithAsset extends FaAuditLine {
  asset_name:        string | null
  asset_tag:         string | null
  current_condition: AssetCondition | null
  expected_location: string | null
}

export interface FaAuditFull extends FaAudit {
  lines: FaAuditLineWithAsset[]
}
