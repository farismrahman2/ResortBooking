// ─── Kitchen requisitions ───────────────────────────────────────────────────

export type RequisitionStatus = 'draft' | 'pending_approval' | 'approved' | 'cancelled'

export interface KitchenVendor {
  id:             string
  slug:           string
  display_name:   string
  sort_order:     number
  order_template: string | null
  bill_template:  string | null
  is_active:      boolean
  created_at:     string
}

export interface RequisitionLine {
  id:                string
  requisition_id:    string
  sort_order:        number
  item_id:           string | null
  /** Snapshot — renaming the item later must not rewrite an approved requisition. */
  item_name:         string
  kitchen_vendor_id: string | null
  qty:               number
  /**
   * Second quantity for lines counted one way and billed another:
   * "Chicken sonali (40 pcs( 31x335)" = 40 birds, 31 kg, billed per kg.
   * `qty` is always what the money is calculated from.
   */
  piece_count:       number | null
  unit_id:           string | null
  notes:             string | null
  is_extra:          boolean
  created_at:        string
}

export interface KitchenRequisition {
  id:                string
  requisition_no:    string
  event_date:        string
  requisition_date:  string
  status:            RequisitionStatus
  is_emergency:      boolean
  parent_requisition_id: string | null
  approved_by_employee_id: string | null
  approved_by_user_id:     string | null
  approved_at:       string | null
  approval_notes:    string | null
  cancelled_at:      string | null
  cancel_reason:     string | null
  notes:             string | null
  created_by:        string | null
  created_at:        string
  updated_at:        string
}

export interface RequisitionWithLines extends KitchenRequisition {
  lines: RequisitionLine[]
}

/** Decorated for the list page. */
export interface RequisitionListRow extends KitchenRequisition {
  line_count:      number
  vendor_count:    number
  approver_name:   string | null
}

/** A line as shown to one vendor, with its unit resolved for display. */
export interface VendorLine {
  item_name:   string
  qty:         number
  piece_count: number | null
  unit_label:  string | null
  notes:       string | null
  is_extra:    boolean
}

export interface VendorSection {
  vendor: KitchenVendor
  lines:  VendorLine[]
}

export const REQUISITION_STATUS_LABELS: Record<RequisitionStatus, string> = {
  draft:            'Draft',
  pending_approval: 'Awaiting approval',
  approved:         'Approved',
  cancelled:        'Cancelled',
}

export const REQUISITION_STATUS_BADGE: Record<RequisitionStatus, string> = {
  draft:            'bg-gray-100 text-gray-700 border-gray-300',
  pending_approval: 'bg-amber-100 text-amber-800 border-amber-300',
  approved:         'bg-green-100 text-green-800 border-green-300',
  cancelled:        'bg-red-50 text-red-500 border-red-200',
}
