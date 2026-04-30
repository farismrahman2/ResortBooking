// ─── Enums ────────────────────────────────────────────────────────────────────

export type PackageType = 'daylong' | 'night'
export type BookingStatus = 'draft' | 'sent' | 'confirmed' | 'cancelled' | 'checked_out'
export type HistoryEvent = 'created' | 'edited' | 'status_changed' | 'converted_to_booking'
export type RoomType =
  | 'cottage'
  | 'eco_deluxe'
  | 'deluxe'
  | 'premium_deluxe'
  | 'premium'
  | 'super_premium'
  | 'tree_house'

// ─── Tables ───────────────────────────────────────────────────────────────────

export interface RoomInventoryRow {
  room_type: RoomType
  display_name: string
  total_units: number
  daylong_only: boolean
  display_order: number
}

export interface PackageRow {
  id: string
  name: string
  type: PackageType
  is_active: boolean
  display_order: number
  // Validity
  all_year: boolean
  valid_from: string | null   // ISO date string
  valid_to: string | null
  specific_dates: string[]
  is_override: boolean
  // Pricing
  weekday_adult: number
  friday_adult: number
  holiday_adult: number
  child_meal: number
  driver_price: number
  extra_person: number
  extra_bed: number
  // Timing
  check_in: string   // HH:MM
  check_out: string
  // Meal inclusions (used for daily report meal counts)
  includes_breakfast: boolean
  includes_lunch:     boolean
  includes_dinner:    boolean
  includes_snacks:    boolean
  // Text blocks
  title: string | null
  intro: string | null
  meals: string | null
  activities: string | null
  experience: string | null
  why_choose_us: string | null
  cta: string | null
  notes: string | null
  // Timestamps
  created_at: string
  updated_at: string
}

export interface PackageRoomPriceRow {
  id: string
  package_id: string
  room_type: RoomType
  price: number
}

export interface SettingRow {
  key: string
  value: string
  updated_at: string
}

export interface HolidayDateRow {
  id: string
  date: string     // ISO date string
  label: string
  created_at: string
}

export interface QuoteRow {
  id: string
  quote_number: string
  customer_name: string
  customer_phone: string
  customer_notes: string | null
  package_type: PackageType
  visit_date: string
  check_out_date: string | null
  nights: number | null           // generated column
  adults: number
  children_paid: number
  children_free: number
  drivers: number
  extra_beds: number
  subtotal:            number
  discount:            number      // effective total discount (flat + pct_amount)
  discount_pct:        number      // percentage component (stored separately for re-editing)
  service_charge_pct:  number     // percentage (default 0)
  total:               number     // generated
  advance_required:    number
  advance_paid:        number
  due_advance:         number     // generated
  remaining:           number     // generated
  status: BookingStatus
  converted_to_booking_id: string | null
  package_snapshot: PackageSnapshot
  line_items: LineItem[]
  extra_items: ExtraItem[]
  created_at: string
  updated_at: string
}

export interface QuoteRoomRow {
  id: string
  quote_id: string
  room_type: RoomType
  qty: number
  unit_price: number
  room_numbers: string[]
}

export interface BookingRow {
  id: string
  booking_number: string
  quote_id: string | null
  customer_name: string
  customer_phone: string
  customer_notes: string | null
  package_type: PackageType
  visit_date: string
  check_out_date: string | null
  nights: number | null
  adults: number
  children_paid: number
  children_free: number
  drivers: number
  extra_beds: number
  subtotal:           number
  discount:           number      // effective total discount (flat + pct_amount)
  discount_pct:       number      // percentage component
  service_charge_pct: number   // percentage (default 0)
  total:              number
  advance_required:   number
  advance_paid:       number
  due_advance:        number
  remaining:          number
  status: BookingStatus
  package_snapshot: PackageSnapshot
  line_items: LineItem[]
  extra_items: ExtraItem[]
  created_at: string
  updated_at: string
}

export interface BookingRoomRow {
  id: string
  booking_id: string
  room_type: RoomType
  qty: number
  unit_price: number
  room_numbers: string[]   // specific room numbers assigned (e.g. ['103', '104'])
}

export interface HistoryLogRow {
  id: string
  entity_type:
    | 'quote' | 'booking' | 'expense'
    | 'employee' | 'payroll_run' | 'loan'
    | 'user' | 'role' | 'checkout' | 'charge_item'
  entity_id: string
  event: HistoryEvent
  actor: string
  payload: Record<string, unknown> | null
  created_at: string
}

// ─── Expense module ───────────────────────────────────────────────────────────

export type ExpenseCategoryGroup =
  | 'bazar' | 'beverages' | 'utilities' | 'maintenance'
  | 'salary' | 'services'  | 'materials' | 'miscellaneous'

export type PayeeType =
  | 'supplier' | 'contractor' | 'staff' | 'utility' | 'other'

export type PaymentMethod =
  | 'cash' | 'bkash' | 'nagad' | 'rocket'
  | 'bank_transfer' | 'cheque' | 'other'

export type BudgetPeriodType = 'monthly' | 'yearly'

export interface ExpenseCategoryRow {
  id: string
  name: string
  slug: string
  category_group: ExpenseCategoryGroup
  requires_description: boolean
  requires_payee: boolean
  is_active: boolean
  display_order: number
  created_at: string
}

export interface ExpensePayeeRow {
  id: string
  name: string
  payee_type: PayeeType
  phone: string | null
  notes: string | null
  is_active: boolean
  display_order: number
  created_at: string
}

export interface ExpenseRow {
  id: string
  expense_date: string                // YYYY-MM-DD
  category_id: string
  payee_id: string | null
  description: string | null
  amount: number
  payment_method: PaymentMethod
  reference_number: string | null
  notes: string | null
  is_draft: boolean
  recurring_template_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface ExpenseAttachmentRow {
  id: string
  expense_id: string
  storage_path: string
  file_name: string
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'
  size_bytes: number
  uploaded_by: string | null
  uploaded_at: string
}

export interface ExpenseBudgetRow {
  id: string
  category_id: string | null          // NULL = "overall" budget
  period_type: BudgetPeriodType
  period_start: string                // YYYY-MM-DD (always day 1 of period)
  amount: number
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RecurringExpenseTemplateRow {
  id: string
  name: string
  category_id: string
  default_payee_id: string | null
  default_amount: number | null
  default_description: string | null
  default_payment_method: PaymentMethod
  day_of_month: number                // 1..28
  is_active: boolean
  last_generated_for: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** Joined shape returned by getExpenses / getExpenseById */
export interface ExpenseRowWithRefs extends ExpenseRow {
  category: Pick<ExpenseCategoryRow, 'id' | 'name' | 'slug' | 'category_group'>
  payee:    Pick<ExpensePayeeRow, 'id' | 'name' | 'payee_type'> | null
  attachments: ExpenseAttachmentRow[]
}

// ─── HR module ───────────────────────────────────────────────────────────────

export type Department =
  | 'management' | 'frontdesk' | 'housekeeping' | 'kitchen' | 'f_and_b'
  | 'security'   | 'maintenance' | 'gardener'   | 'accounts' | 'other'

export type Gender = 'male' | 'female' | 'other'

export type EmploymentStatus = 'active' | 'on_leave' | 'terminated' | 'resigned'

export type AttendanceStatus =
  | 'present' | 'absent' | 'paid_leave' | 'unpaid_leave'
  | 'weekly_off' | 'holiday' | 'half_day'

export type SalaryAdjustmentType =
  | 'fine' | 'bonus' | 'eid_bonus' | 'advance'
  | 'loan_repayment' | 'other_addition' | 'other_deduction'

export type LoanStatus = 'active' | 'closed' | 'written_off'

export type PayrollRunStatus = 'draft' | 'finalized'

export interface EmployeeRow {
  id: string
  employee_code: string
  full_name: string
  photo_url: string | null
  designation: string
  department: Department
  nid_number: string | null
  date_of_birth: string | null
  gender: Gender | null
  blood_group: string | null
  phone: string
  email: string | null
  present_address: string | null
  permanent_address: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  emergency_contact_relation: string | null
  joining_date: string
  employment_status: EmploymentStatus
  termination_date: string | null
  termination_reason: string | null
  is_live_in: boolean
  meal_allowance_in_kind: boolean
  expense_payee_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface SalaryStructureRow {
  id: string
  employee_id: string
  effective_from: string
  effective_to: string | null
  basic: number
  house_rent: number
  medical: number
  transport: number
  mobile: number
  other_allowance: number
  gross: number
  notes: string | null
  created_at: string
}

export interface LeaveTypeRow {
  id: string
  name: string
  slug: string
  default_annual_balance: number
  is_paid: boolean
  display_order: number
  is_active: boolean
  created_at: string
}

export interface LeaveBalanceRow {
  id: string
  employee_id: string
  leave_type_id: string
  year: number
  opening_balance: number
  accrued: number
  used: number
  available: number
}

export interface AttendanceRow {
  id: string
  employee_id: string
  date: string
  status: AttendanceStatus
  leave_type_id: string | null
  notes: string | null
  marked_by: string | null
  marked_at: string
}

export interface SalaryAdjustmentRow {
  id: string
  employee_id: string
  applies_to_month: string          // YYYY-MM-01
  type: SalaryAdjustmentType
  amount: number
  description: string | null
  loan_id: string | null
  created_by: string | null
  created_at: string
  payroll_run_line_id: string | null
}

export interface LoanRow {
  id: string
  employee_id: string
  principal: number
  monthly_installment: number
  amount_repaid: number
  outstanding: number
  taken_on: string
  repayment_starts: string
  status: LoanStatus
  notes: string | null
  created_at: string
}

export interface ServiceChargePayoutRow {
  id: string
  employee_id: string
  applies_to_month: string
  amount: number
  notes: string | null
  created_by: string | null
  created_at: string
}

export interface PayrollRunRow {
  id: string
  period: string                    // YYYY-MM-01
  status: PayrollRunStatus
  generated_at: string
  generated_by: string | null
  finalized_at: string | null
  finalized_by: string | null
  total_gross: number
  total_net: number
  notes: string | null
}

export interface PayrollRunLineRow {
  id: string
  payroll_run_id: string
  employee_id: string
  basic: number
  house_rent: number
  medical: number
  transport: number
  mobile: number
  other_allowance: number
  gross: number
  days_in_month: number
  days_present: number
  days_absent: number
  days_paid_leave: number
  days_unpaid_leave: number
  days_weekly_off: number
  days_holiday: number
  unpaid_deduction: number
  bonuses: number
  eid_bonus: number
  other_additions: number
  fines: number
  advance_deduction: number
  loan_deduction: number
  other_deductions: number
  service_charge: number
  net_pay: number
  expense_id: string | null
  payment_method: PaymentMethod | null
  paid_at: string | null
  notes: string | null
}

/** Employee with the currently-effective salary structure attached. */
export interface EmployeeWithCurrentSalary extends EmployeeRow {
  current_salary: SalaryStructureRow | null
}

// ─── Auth & Roles ────────────────────────────────────────────────────────────

export type RoleSlug       = 'admin' | 'manager' | 'front_desk' | 'accountant'
export type ModuleSlug     = 'bookings' | 'checkout' | 'expenses' | 'hr' | 'reports' | 'settings'
export type PermissionLevel = 'none' | 'read' | 'write'

export interface RoleRow {
  id: string
  slug: RoleSlug
  display_name: string
  description: string | null
  is_system: boolean
  display_order: number
  created_at: string
}

export interface ModuleRow {
  id: string
  slug: ModuleSlug
  display_name: string
  description: string | null
  display_order: number
}

export interface RolePermissionRow {
  id: string
  role_id: string
  module_id: string
  level: PermissionLevel
  updated_at: string
  updated_by: string | null
}

export interface UserProfileRow {
  user_id: string
  full_name: string
  email: string
  role_id: string
  is_active: boolean
  phone: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  last_login_at: string | null
}

export interface UserProfileWithRole extends UserProfileRow {
  role: Pick<RoleRow, 'id' | 'slug' | 'display_name'>
}

export interface RoleWithPermissions extends RoleRow {
  permissions: Array<RolePermissionRow & {
    module: Pick<ModuleRow, 'id' | 'slug' | 'display_name'>
  }>
}

// ─── Checkout module ─────────────────────────────────────────────────────────

export type CheckoutStatus       = 'draft' | 'finalized' | 'voided'
export type CheckoutPaymentMethod = 'cash' | 'bkash' | 'nagad' | 'rocket' | 'card' | 'bank_transfer' | 'other'

export interface ChargeCategoryRow {
  id: string
  slug: string
  display_name: string
  display_order: number
  is_active: boolean
  created_at: string
}

export interface ChargeItemRow {
  id: string
  category_id: string
  name: string
  default_price: number
  description: string | null
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface CheckoutRow {
  id: string
  booking_id: string
  status: CheckoutStatus
  advance_amount: number
  charges_total: number
  payments_total: number
  net_due: number              // generated
  refund_amount: number
  refund_expense_id: string | null
  notes: string | null
  finalized_at: string | null
  finalized_by: string | null
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
  created_at: string
  updated_at: string
}

export interface CheckoutChargeRow {
  id: string
  checkout_id: string
  category_id: string
  charge_item_id: string | null
  description: string
  quantity: number
  unit_price: number
  amount: number               // generated
  notes: string | null
  added_by: string | null
  added_at: string
}

export interface CheckoutPaymentRow {
  id: string
  checkout_id: string
  amount: number
  method: CheckoutPaymentMethod
  reference: string | null
  paid_at: string
  recorded_by: string | null
  notes: string | null
}

export interface ChargeItemWithCategory extends ChargeItemRow {
  category: Pick<ChargeCategoryRow, 'id' | 'slug' | 'display_name'>
}

export interface CheckoutChargeWithRefs extends CheckoutChargeRow {
  category: Pick<ChargeCategoryRow, 'id' | 'slug' | 'display_name'>
  charge_item: Pick<ChargeItemRow, 'id' | 'name'> | null
}

export interface CheckoutWithFull extends CheckoutRow {
  booking: BookingRow
  charges: CheckoutChargeWithRefs[]
  payments: CheckoutPaymentRow[]
}

// ─── Derived / Computed Types ──────────────────────────────────────────────────

/** Complete package state captured at quote/booking creation time */
export interface PackageSnapshot {
  package_id: string
  name: string
  type: PackageType
  weekday_adult: number
  friday_adult: number
  holiday_adult: number
  child_meal: number
  driver_price: number
  extra_person: number
  extra_bed: number
  check_in: string
  check_out: string
  title: string | null
  intro: string | null
  meals: string | null
  activities: string | null
  experience: string | null
  why_choose_us: string | null
  cta: string | null
  notes: string | null
  room_prices: Partial<Record<RoomType, number>>
  // Meal flags (may be absent on old snapshots — default gracefully)
  includes_breakfast?: boolean
  includes_lunch?:     boolean
  includes_dinner?:    boolean
  includes_snacks?:    boolean
  snapshotted_at: string
}

/** Individual line item for pricing breakdown */
export interface LineItem {
  label: string
  qty: number
  unit_price: number
  nights: number | null
  subtotal: number
}

/** Custom extra item added to a quote/booking */
export interface ExtraItem {
  label: string
  qty: number
  unit_price: number
}

/** Result from the availability engine */
export interface AvailabilityResult {
  room_type: RoomType
  display_name: string
  total_units: number
  booked: number
  available: number
  daylong_only: boolean
}

/** Package with its room prices (joined) */
export interface PackageWithPrices extends PackageRow {
  room_prices: PackageRoomPriceRow[]
}

/** Quote with its rooms (joined) */
export interface QuoteWithRooms extends QuoteRow {
  rooms: QuoteRoomRow[]
}

/** Booking with its rooms (joined) */
export interface BookingWithRooms extends BookingRow {
  rooms: BookingRoomRow[]
}

/** Settings map for easy access */
export type SettingsMap = Record<string, string>

// ─── Database type (Supabase shape) ────────────────────────────────────────────
// Matches the structure expected by @supabase/supabase-js v2

export interface Database {
  public: {
    PostgrestVersion: "12"
    Tables: {
      room_inventory: {
        Row: RoomInventoryRow
        Insert: RoomInventoryRow
        Update: Partial<RoomInventoryRow>
        Relationships: []
      }
      packages: {
        Row: PackageRow
        Insert: Omit<PackageRow, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<PackageRow, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      package_room_prices: {
        Row: PackageRoomPriceRow
        Insert: Omit<PackageRoomPriceRow, 'id'>
        Update: Partial<Omit<PackageRoomPriceRow, 'id'>>
        Relationships: []
      }
      settings: {
        Row: SettingRow
        Insert: Omit<SettingRow, 'updated_at'>
        Update: Partial<Omit<SettingRow, 'updated_at'>>
        Relationships: []
      }
      holiday_dates: {
        Row: HolidayDateRow
        Insert: Omit<HolidayDateRow, 'id' | 'created_at'>
        Update: Partial<Omit<HolidayDateRow, 'id' | 'created_at'>>
        Relationships: []
      }
      quotes: {
        Row: QuoteRow
        Insert: Omit<QuoteRow, 'id' | 'nights' | 'total' | 'due_advance' | 'remaining' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<QuoteRow, 'id' | 'nights' | 'total' | 'due_advance' | 'remaining' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      quote_rooms: {
        Row: QuoteRoomRow
        Insert: Omit<QuoteRoomRow, 'id'>
        Update: Partial<Omit<QuoteRoomRow, 'id'>>
        Relationships: []
      }
      bookings: {
        Row: BookingRow
        Insert: Omit<BookingRow, 'id' | 'nights' | 'total' | 'due_advance' | 'remaining' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<BookingRow, 'id' | 'nights' | 'total' | 'due_advance' | 'remaining' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      booking_rooms: {
        Row: BookingRoomRow
        Insert: Omit<BookingRoomRow, 'id'>
        Update: Partial<Omit<BookingRoomRow, 'id'>>
        Relationships: []
      }
      history_log: {
        Row: HistoryLogRow
        Insert: Omit<HistoryLogRow, 'id' | 'created_at'>
        Update: never
        Relationships: []
      }
      expense_categories: {
        Row: ExpenseCategoryRow
        Insert: Omit<ExpenseCategoryRow, 'id' | 'created_at'>
        Update: Partial<Omit<ExpenseCategoryRow, 'id' | 'created_at'>>
        Relationships: []
      }
      expense_payees: {
        Row: ExpensePayeeRow
        Insert: Omit<ExpensePayeeRow, 'id' | 'created_at'>
        Update: Partial<Omit<ExpensePayeeRow, 'id' | 'created_at'>>
        Relationships: []
      }
      expenses: {
        Row: ExpenseRow
        Insert: Omit<ExpenseRow, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ExpenseRow, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      expense_attachments: {
        Row: ExpenseAttachmentRow
        Insert: Omit<ExpenseAttachmentRow, 'id' | 'uploaded_at'>
        Update: Partial<Omit<ExpenseAttachmentRow, 'id' | 'uploaded_at'>>
        Relationships: []
      }
      expense_budgets: {
        Row: ExpenseBudgetRow
        Insert: Omit<ExpenseBudgetRow, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ExpenseBudgetRow, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      recurring_expense_templates: {
        Row: RecurringExpenseTemplateRow
        Insert: Omit<RecurringExpenseTemplateRow, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<RecurringExpenseTemplateRow, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      employees: {
        Row: EmployeeRow
        Insert: Omit<EmployeeRow, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<EmployeeRow, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      salary_structures: {
        Row: SalaryStructureRow
        Insert: Omit<SalaryStructureRow, 'id' | 'gross' | 'created_at'>
        Update: Partial<Omit<SalaryStructureRow, 'id' | 'gross' | 'created_at'>>
        Relationships: []
      }
      leave_types: {
        Row: LeaveTypeRow
        Insert: Omit<LeaveTypeRow, 'id' | 'created_at'>
        Update: Partial<Omit<LeaveTypeRow, 'id' | 'created_at'>>
        Relationships: []
      }
      leave_balances: {
        Row: LeaveBalanceRow
        Insert: Omit<LeaveBalanceRow, 'id' | 'available'>
        Update: Partial<Omit<LeaveBalanceRow, 'id' | 'available'>>
        Relationships: []
      }
      attendance: {
        Row: AttendanceRow
        Insert: Omit<AttendanceRow, 'id' | 'marked_at'>
        Update: Partial<Omit<AttendanceRow, 'id' | 'marked_at'>>
        Relationships: []
      }
      salary_adjustments: {
        Row: SalaryAdjustmentRow
        Insert: Omit<SalaryAdjustmentRow, 'id' | 'created_at'>
        Update: Partial<Omit<SalaryAdjustmentRow, 'id' | 'created_at'>>
        Relationships: []
      }
      loans: {
        Row: LoanRow
        Insert: Omit<LoanRow, 'id' | 'outstanding' | 'created_at'>
        Update: Partial<Omit<LoanRow, 'id' | 'outstanding' | 'created_at'>>
        Relationships: []
      }
      service_charge_payouts: {
        Row: ServiceChargePayoutRow
        Insert: Omit<ServiceChargePayoutRow, 'id' | 'created_at'>
        Update: Partial<Omit<ServiceChargePayoutRow, 'id' | 'created_at'>>
        Relationships: []
      }
      payroll_runs: {
        Row: PayrollRunRow
        Insert: Omit<PayrollRunRow, 'id' | 'generated_at'>
        Update: Partial<Omit<PayrollRunRow, 'id' | 'generated_at'>>
        Relationships: []
      }
      payroll_run_lines: {
        Row: PayrollRunLineRow
        Insert: Omit<PayrollRunLineRow, 'id'>
        Update: Partial<Omit<PayrollRunLineRow, 'id'>>
        Relationships: []
      }
      roles: {
        Row: RoleRow
        Insert: Omit<RoleRow, 'id' | 'created_at'>
        Update: Partial<Omit<RoleRow, 'id' | 'created_at'>>
        Relationships: []
      }
      modules: {
        Row: ModuleRow
        Insert: Omit<ModuleRow, 'id'>
        Update: Partial<Omit<ModuleRow, 'id'>>
        Relationships: []
      }
      role_permissions: {
        Row: RolePermissionRow
        Insert: Omit<RolePermissionRow, 'id' | 'updated_at'>
        Update: Partial<Omit<RolePermissionRow, 'id' | 'updated_at'>>
        Relationships: []
      }
      user_profiles: {
        Row: UserProfileRow
        Insert: Omit<UserProfileRow, 'created_at' | 'updated_at'>
        Update: Partial<Omit<UserProfileRow, 'user_id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      charge_categories: {
        Row: ChargeCategoryRow
        Insert: Omit<ChargeCategoryRow, 'id' | 'created_at'>
        Update: Partial<Omit<ChargeCategoryRow, 'id' | 'created_at'>>
        Relationships: []
      }
      charge_items: {
        Row: ChargeItemRow
        Insert: Omit<ChargeItemRow, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ChargeItemRow, 'id' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      checkouts: {
        Row: CheckoutRow
        Insert: Omit<CheckoutRow, 'id' | 'net_due' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<CheckoutRow, 'id' | 'net_due' | 'created_at' | 'updated_at'>>
        Relationships: []
      }
      checkout_charges: {
        Row: CheckoutChargeRow
        Insert: Omit<CheckoutChargeRow, 'id' | 'amount' | 'added_at'>
        Update: Partial<Omit<CheckoutChargeRow, 'id' | 'amount' | 'added_at'>>
        Relationships: []
      }
      checkout_payments: {
        Row: CheckoutPaymentRow
        Insert: Omit<CheckoutPaymentRow, 'id' | 'paid_at'>
        Update: Partial<Omit<CheckoutPaymentRow, 'id' | 'paid_at'>>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      get_availability_range: {
        Args: { p_from: string; p_to: string }
        Returns: { check_date: string; check_room_type: RoomType; qty_booked: number }[]
      }
    }
    Enums: {
      package_type: PackageType
      booking_status: BookingStatus
      history_event: HistoryEvent
      room_type: RoomType
    }
    CompositeTypes: Record<string, never>
  }
}
