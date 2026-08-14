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

// ─── Dispatch log ───────────────────────────────────────────────────────────

export interface RequisitionDispatch {
  id:                string
  requisition_id:    string
  kitchen_vendor_id: string
  sent_at:           string
  sent_by_user_id:   string | null
  message_snapshot:  string | null
}

// ─── Deliveries ─────────────────────────────────────────────────────────────

export type DeliveryStatus = 'draft' | 'confirmed' | 'cancelled'

export interface DeliveryLine {
  id:                  string
  delivery_id:         string
  sort_order:          number
  requisition_line_id: string | null
  item_id:             string | null
  item_name:           string
  /** What the requisition asked for. Null on an unrequested item. */
  qty_ordered:         number | null
  qty_delivered:       number
  rejected_qty:        number | null
  reject_reason:       string | null
  piece_count:         number | null
  unit_id:             string | null
  unit_price:          number
  line_total:          number
  is_unrequested:      boolean
  notes:               string | null
  created_at:          string
}

export interface KitchenDelivery {
  id:                 string
  delivery_no:        string
  requisition_id:     string | null
  kitchen_vendor_id:  string
  supplier_id:        string | null
  delivery_date:      string
  supplier_memo_no:   string | null
  /** The total written on their paper. Null when nobody typed it in. */
  supplier_memo_total: number | null
  received_by_employee_id: string | null
  status:             DeliveryStatus
  total_amount:       number
  memo_photo_path:    string | null
  notes:              string | null
  cancel_reason:      string | null
  created_by:         string | null
  created_at:         string
  updated_at:         string
}

export interface DeliveryWithLines extends KitchenDelivery {
  lines: DeliveryLine[]
}

/** Decorated for the deliveries list and the vendor ledger. */
export interface DeliveryListRow extends KitchenDelivery {
  vendor_name:     string
  requisition_no:  string | null
  receiver_name:   string | null
  /** Sum of allocations against this delivery. */
  paid_amount:     number
  outstanding:     number
}

// ─── Payments ───────────────────────────────────────────────────────────────

export type PaymentMethod =
  | 'cheque' | 'cash' | 'bank_transfer' | 'bkash' | 'nagad' | 'adjustment'

export interface PaymentAllocation {
  id:               string
  payment_id:       string
  delivery_id:      string
  amount_allocated: number
}

export interface KitchenPayment {
  id:                string
  payment_no:        string
  kitchen_vendor_id: string
  supplier_id:       string | null
  payment_date:      string
  method:            PaymentMethod
  cheque_no:         string | null
  cheque_date:       string | null
  bank_name:         string | null
  amount:            number
  photo_path:        string | null
  notes:             string | null
  status:            'recorded' | 'cancelled'
  cancel_reason:     string | null
  created_by:        string | null
  created_at:        string
  updated_at:        string
}

export interface PaymentWithAllocations extends KitchenPayment {
  allocations: Array<PaymentAllocation & {
    delivery_no:   string
    delivery_date: string
    total_amount:  number
  }>
}

/** One vendor's position: what they delivered, what we paid, what's open. */
export interface VendorLedgerRow {
  vendor:       KitchenVendor
  delivered:    number
  paid:         number
  outstanding:  number
  open_bills:   number
  last_delivery_date: string | null
  last_payment_date:  string | null
}

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  draft:     'Draft',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
}

export const DELIVERY_STATUS_BADGE: Record<DeliveryStatus, string> = {
  draft:     'bg-gray-100 text-gray-700 border-gray-300',
  confirmed: 'bg-green-100 text-green-800 border-green-300',
  cancelled: 'bg-red-50 text-red-500 border-red-200',
}

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cheque:        'Cheque',
  cash:          'Cash',
  bank_transfer: 'Bank transfer',
  bkash:         'bKash',
  nagad:         'Nagad',
  adjustment:    'Adjustment',
}

// ─── Requisition templates ──────────────────────────────────────────────────

export interface TemplateLine {
  id:                string
  template_id:       string
  sort_order:        number
  item_id:           string | null
  item_name:         string
  kitchen_vendor_id: string | null
  qty:               number
  piece_count:       number | null
  unit_id:           string | null
  notes:             string | null
}

export interface RequisitionTemplate {
  id:          string
  name:        string
  description: string | null
  sort_order:  number
  is_active:   boolean
  created_by:  string | null
  created_at:  string
  updated_at:  string
}

export interface TemplateWithLines extends RequisitionTemplate {
  lines: TemplateLine[]
}
