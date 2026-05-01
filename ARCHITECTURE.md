# Garden Centre Resort — Booking Agent: System & Technical Architecture

**Purpose of this document:** complete context for planning new modules on top of the existing application. Paste this whole file into a fresh Claude AI chat, then describe the new module you want — the assistant will have everything it needs to plan around the existing system.

---

## 1. Product overview

**App name:** Garden Centre Resort — Auto Quotation & Booking Agent
**Repo:** `resort-agent` (Next.js 14 App Router)
**Users:** Internal resort staff (single-tenant). Admin creates user accounts via Supabase Dashboard; no self-signup. All routes are auth-protected.
**Currency:** BDT (Bangladeshi Taka, ৳).

The app handles the resort's quotation, booking, and expense workflow:
- Staff create a **quote** for a customer (selects package, date(s), guests, rooms, extras → live pricing preview → generates a copy-paste WhatsApp message).
- Confirmed quotes are converted to **bookings**, which track payment status, room number assignments, and a frozen pricing snapshot.
- Daily **expenses** are entered (Bazar / suppliers / utilities / contractors / salaries) — feeds a Profit & Loss view that joins booking revenue against expense outflow.
- Supporting features: package management, room availability calendar, holiday calendar, settings, daily kitchen/housekeeping reports, **revenue analytics**, **expense analytics**, **monthly Excel-style expense report**, **budgets**, **recurring-expense draft generation**, **receipt attachments**.

### Two package types (drives core branching)
- **Daylong**: single visit_date, no nights. Guests come in the morning, leave in the evening.
- **Night**: check-in date + check-out date, `nights = check_out - visit_date`. Multi-night stay.

The codebase branches on `package_type` everywhere — date inputs, calculation engine, WhatsApp output, availability, reports.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router, Server Components by default) |
| Language | TypeScript (strict mode, `@/*` path alias → project root) |
| UI | React 18, Tailwind CSS 3 (custom `forest` primary, `amber` warning, `emerald` success/comp, `indigo` secondary, `rose` for the expense module accent — kept distinct from booking-revenue green) |
| Storage | Supabase Storage — single private bucket `expense-receipts` for receipt uploads (JPEG/PNG/WebP/PDF, ≤10 MB). Path convention `<YYYY>/<MM>/<expense_id>/<filename>`. Read/write through signed URLs minted server-side |
| Forms | react-hook-form + zod (`@hookform/resolvers/zod`) |
| DB / Auth | Supabase (Postgres). `@supabase/supabase-js` ^2.47, `@supabase/ssr` ^0.5.2 (cookie-based SSR auth) |
| Charts | recharts ^2.13 (added in analytics module) |
| Date pickers | react-day-picker ^8.10 (wrapped in `components/ui/DateRangePicker.tsx`) |
| Date utils | date-fns ^3.6 (used sparingly; most date logic is in `lib/formatters/dates.ts` + `lib/config/rooms.ts::nextDay`) |
| Print/PDF | jspdf + jspdf-autotable + react-to-print (used for printable quote/booking pages); analytics uses browser native Print-to-PDF instead |
| Icons | lucide-react |
| Deploy | Vercel (auto-deploy on push to `main`) |

### Key Supabase / SSR quirks
- Auth uses the new `sb_publishable_...` key format → requires `@supabase/ssr >= 0.5.0`.
- Server components / actions use `lib/supabase/server.ts::createClient()`. Middleware uses `lib/supabase/middleware.ts::createMiddlewareClient(request)`. Browser components use `lib/supabase/client.ts`.
- Most queries cast `supabase as any` (variable `db`) to sidestep the strict generated `Database` type when constructing dynamic filter chains. This is intentional — it kept the codebase shippable without fighting the generic.

---

## 3. Database schema (definitive — from `lib/supabase/types.ts`)

### Enums
```ts
type PackageType   = 'daylong' | 'night'
type BookingStatus = 'draft' | 'sent' | 'confirmed' | 'cancelled' | 'checked_out'
type HistoryEvent  = 'created' | 'edited' | 'status_changed' | 'converted_to_booking'
type RoomType      = 'cottage' | 'eco_deluxe' | 'deluxe' | 'premium_deluxe'
                   | 'premium' | 'super_premium' | 'tree_house'

// HR module
type Department          = 'management'|'frontdesk'|'housekeeping'|'kitchen'|'f_and_b'
                         | 'security'|'maintenance'|'gardener'|'accounts'|'other'
type EmploymentStatus    = 'active' | 'on_leave' | 'terminated' | 'resigned'
type AttendanceStatus    = 'present'|'absent'|'paid_leave'|'unpaid_leave'
                         | 'weekly_off'|'holiday'|'half_day'
type SalaryAdjustmentType = 'fine'|'bonus'|'eid_bonus'|'advance'
                          | 'loan_repayment'|'other_addition'|'other_deduction'
type LoanStatus          = 'active' | 'closed' | 'written_off'
type PayrollRunStatus    = 'draft' | 'finalized'

// Auth & Roles
type RoleSlug        = 'admin' | 'manager' | 'front_desk' | 'accountant'
type ModuleSlug      = 'bookings' | 'checkout' | 'expenses' | 'hr' | 'reports' | 'settings' | 'availability'
type PermissionLevel = 'none' | 'read' | 'write'

// Checkout
type CheckoutStatus        = 'draft' | 'finalized' | 'voided'
type CheckoutPaymentMethod = 'cash'|'bkash'|'nagad'|'rocket'|'card'|'bank_transfer'|'other'
type AdminAlertEvent       = 'discount_applied'|'guest_reduced'|'checkout_voided'
                           | 'refund_recorded'|'booking_cancelled'|'user_deactivated'
```

> **Important:**
> - `history_event` is a Postgres ENUM. Adding new values requires a migration (`ALTER TYPE … ADD VALUE`). We've avoided that by reusing `'edited'` with a descriptive `payload.action` field (e.g. `payload.action = 'dates_changed' | 'rooms_swapped'`).
> - `history_log.entity_type` is **NOT** an enum — it's a TEXT column guarded by a CHECK constraint. Currently allows: `quote | booking | expense | employee | payroll_run | loan | user | role | checkout | charge_item`. To allow a new value, drop and recreate the CHECK constraint with the new value included. See `migrations/expense-module/000_extend_entity_type_enum.sql` for the canonical pattern.
> - `bookings.status` was extended to allow `checked_out` in `migrations/checkout-module/000_create_checkout_tables.sql`. The migration handles both the CHECK and ENUM cases via a DO-block.

### Tables

| Table | Key columns | Notes |
|---|---|---|
| **room_inventory** | `room_type` (PK), `display_name`, `total_units`, `daylong_only` (bool), `display_order` | Fixed inventory: how many units of each type exist. Tree house is `daylong_only`. |
| **packages** | `id`, `name`, `type`, `is_active`, `display_order`, validity (`all_year`/`valid_from`/`valid_to`/`specific_dates[]`/`is_override`), pricing (`weekday_adult`/`friday_adult`/`holiday_adult`/`child_meal`/`driver_price`/`extra_person`/`extra_bed`), timing (`check_in`/`check_out`), meal flags (`includes_breakfast` etc.), text blocks (`title`/`intro`/`meals`/`activities`/`experience`/`why_choose_us`/`cta`/`notes`) | Override packages take priority over regular packages on overlapping dates. See `lib/engine/package-resolver.ts`. |
| **package_room_prices** | `id`, `package_id`, `room_type`, `price` | Per-package, per-room-type pricing. |
| **settings** | `key`, `value` (text-only KV). Common keys: `payment_instructions`, `contact_numbers`, `whatsapp_footer_text`. |
| **holiday_dates** | `id`, `date` (ISO), `label` | Used by calculator to apply holiday rate. |
| **quotes** | `id`, `quote_number`, customer info, `package_type`, `visit_date`, `check_out_date` (nullable for daylong), `nights` (generated), guests, pricing (`subtotal`/`discount`/`discount_pct`/`service_charge_pct`/`total` (gen)/`advance_required`/`advance_paid`/`due_advance` (gen)/`remaining` (gen)), `status` (BookingStatus), `converted_to_booking_id`, `sales_employee_id` (FK → `employees`, nullable), `package_snapshot` (JSONB), `line_items[]` (JSONB), `extra_items[]` (JSONB) | `total`, `due_advance`, `remaining`, `nights` are DB-generated columns. `sales_employee_id` tags which sales rep referred this customer; copied onto the booking on conversion. |
| **quote_rooms** | `id`, `quote_id`, `room_type`, `qty`, `unit_price`, `room_numbers[]` | One row per (quote, room_type, charge_mode). **Two rows of the same room_type can coexist** — one paid (`unit_price > 0`) and one complimentary (`unit_price === 0`). |
| **bookings** | Mirror of `quotes` minus `quote_number → booking_number` and adds optional `quote_id` link. Same generated columns. Also has `sales_employee_id` for attribution. | `package_snapshot` is **frozen** at booking creation; subsequent edits to the originating package don't affect the booking. `sales_employee_id` is copied from `quotes` on conversion and re-assignable via `setBookingSalesRep` (admin/manager). |
| **booking_rooms** | `id`, `booking_id`, `room_type`, `qty`, `unit_price`, `room_numbers[]` | Same multi-row-per-type semantics as `quote_rooms`. The `id` is now the canonical row identifier used by the `swapRoomAssignment` server action. |
| **history_log** | `id`, `entity_type` (10 values — see Enums), `entity_id` (uuid), `event` (HistoryEvent), `actor`, `payload` (JSONB), `created_at` | Audit trail. INSERTs only. May not exist on a fresh Supabase project — `migrations/expense-module/000_extend_entity_type_enum.sql` `CREATE TABLE IF NOT EXISTS` it. |

### Expense module tables (Phase 1–3)

| Table | Key columns | Notes |
|---|---|---|
| **expense_categories** | `id`, `name`, `slug` (unique), `category_group` (CHECK enum: bazar/beverages/utilities/maintenance/salary/services/materials/miscellaneous), `requires_description`, `requires_payee`, `is_active`, `display_order` | Soft-deleted via `is_active`, never hard-deleted (would orphan historical expenses). Slug is the stable code; `name` can be edited freely. |
| **expense_payees** | `id`, `name` (unique on `lower(name)`), `payee_type` (supplier/contractor/staff/utility/other), `phone`, `notes`, `is_active`, `display_order` | Same soft-delete pattern. |
| **expenses** | `id`, `expense_date`, `category_id`, `payee_id`, `description`, `amount` (numeric > 0), `payment_method` (cash/bkash/nagad/rocket/bank_transfer/cheque/other), `reference_number`, `notes`, `is_draft`, `recurring_template_id`, `created_by` (auth user) | The transaction ledger. `is_draft=true` rows are auto-generated from recurring templates and excluded from every analytics query until confirmed. |
| **expense_attachments** | `id`, `expense_id`, `storage_path`, `file_name`, `mime_type` (CHECK to image/pdf), `size_bytes` (CHECK ≤ 10485760), `uploaded_by` | Receipt metadata. ON DELETE CASCADE from `expenses`. Storage object is removed by the `removeReceipt` server action — FK CASCADE alone won't delete the binary. |
| **expense_budgets** | `id`, `category_id` (NULL = "overall"), `period_type` ('monthly'\|'yearly'), `period_start`, `amount`, `notes` | Two partial unique indexes enforce one budget per (category, period_type, period_start) — one for `category_id IS NULL`, one for `category_id IS NOT NULL`. |
| **recurring_expense_templates** | `id`, `name`, `category_id`, `default_payee_id`, `default_amount` (NULL = manual), `default_description`, `default_payment_method`, `day_of_month` (1–28), `is_active`, `last_generated_for` (date) | `last_generated_for` is the idempotency key for `generateMonthlyDrafts` — templates are only fired for a month when `last_generated_for IS NULL OR < period_start`. |

### HR module tables (`migrations/hr-module/`)

| Table | Key columns | Notes |
|---|---|---|
| **employees** | `id`, `employee_code` (unique, e.g. `GCR-001`), `full_name`, `designation`, `department`, contact info, `joining_date`, `employment_status`, `is_live_in`, `is_sales`, `sales_team`, `expense_payee_id` (FK → `expense_payees`), `notes` | Auto-creates an `expense_payees` row on insert (the integration spine — payroll auto-writes salary `expenses` against it). Termination via separate `terminateEmployee` action — never delete. `is_sales=true` lets the employee be picked as a booking's sales rep; `sales_team` groups them in `/hr/sales` reports. |
| **salary_structures** | `id`, `employee_id`, `effective_from`, `effective_to` (NULL = current), `basic`, `house_rent`, `medical`, `transport`, `mobile`, `other_allowance`, `gross` (gen) | Effective-dated history. `setSalaryStructure` always closes the current row before inserting a new one — historical rows are never edited in place. |
| **leave_types** | `id`, `name`, `slug` (unique), `default_annual_balance`, `is_paid`, `display_order`, `is_active` | Seeded with annual / sick / casual / unpaid. Editable via `/hr/leaves/types`. Slug locks once used. |
| **leave_balances** | `id`, `employee_id`, `leave_type_id`, `year`, `opening_balance`, `accrued`, `used`, `available` (gen) | One row per (employee, leave_type, year). `initializeLeaveBalances(year)` action seeds these. `markAttendance` auto-syncs `used` when a status flips to/from `paid_leave`. |
| **attendance** | `id`, `employee_id`, `date`, `status` (AttendanceStatus), `leave_type_id` (required when paid/unpaid leave), `marked_by`, `marked_at` | UNIQUE (employee_id, date). Re-marking the same date upserts. |
| **salary_adjustments** | `id`, `employee_id`, `applies_to_month` (YYYY-MM-01), `type` (SalaryAdjustmentType), `amount`, `description`, `loan_id` (FK), `payroll_run_line_id` (back-ref) | Once a row's `payroll_run_line_id` is non-null (i.e. picked up by a finalized run), it's read-only. `loan_repayment` rows are auto-generated by the payroll engine — never user-entered. |
| **loans** | `id`, `employee_id`, `principal`, `monthly_installment`, `amount_repaid`, `outstanding` (gen), `taken_on`, `repayment_starts`, `status` (LoanStatus), `notes` | Outstanding is a generated column. Auto-closed by `finalizePayrollRun` when `outstanding ≤ 0`. |
| **service_charge_payouts** | `id`, `employee_id`, `applies_to_month`, `amount`, `notes` | UNIQUE (employee_id, applies_to_month). Manual entry per staff per month at `/hr/service-charge`. Picked up by the payroll engine. |
| **payroll_runs** | `id`, `period` (UNIQUE, YYYY-MM-01), `status` (PayrollRunStatus), `generated_at`, `finalized_at`, `total_gross`, `total_net` | One row per month. Status flips to `finalized` only on/after the 1st of the next month (operator-triggered). |
| **payroll_run_lines** | `id`, `payroll_run_id`, `employee_id`, full salary snapshot, attendance counts, `unpaid_deduction`, `bonuses`/`fines`/`loan_deduction`/etc, `service_charge`, `net_pay`, `expense_id` (FK → `expenses`), `payment_method`, `paid_at` | UNIQUE (payroll_run_id, employee_id). On finalize, the matching `expenses` row is created in the `salary` category against the staff's `expense_payee_id`. |

### Auth & Roles tables (`migrations/auth-roles-module/`)

| Table | Key columns | Notes |
|---|---|---|
| **roles** | `id`, `slug` (CHECK enum: 4 RoleSlug values), `display_name`, `description`, `is_system`, `display_order` | 4 system roles, seeded. **Cannot be deleted, cannot be renamed** in v1 — only their permissions are editable. |
| **modules** | `id`, `slug` (7 ModuleSlug values), `display_name`, `description`, `display_order` | 7 modules: bookings, checkout, expenses, hr, reports, settings, availability. Seeded once. |
| **role_permissions** | `id`, `role_id`, `module_id`, `level` (none/read/write), `updated_by` | UNIQUE (role_id, module_id). Default matrix seeded. Edited via `/settings/roles/[slug]`. |
| **user_profiles** | `user_id` (PK, FK → `auth.users` ON DELETE CASCADE), `full_name`, `email`, `role_id`, `is_active`, `phone`, `created_by`, `last_login_at` | One per system user. Backfill block in migration 000 auto-creates an admin profile for any pre-existing `auth.users` row, so the first-time install doesn't lock the operator out. |
| **admin_alerts** | `id`, `event_type` (AdminAlertEvent), `entity_type`, `entity_id`, `summary`, `payload` (JSONB), `acknowledged_at`, `acknowledged_by`, `created_by` | Surfaces flagged events for admin review at `/settings/audit-log`. Inserted via `flagAlert` (best-effort, non-blocking). Unread count drives the Settings sidebar badge. |

### Checkout module tables (`migrations/checkout-module/`)

| Table | Key columns | Notes |
|---|---|---|
| **charge_categories** | `id`, `slug` (unique), `display_name`, `display_order`, `is_active` | Seeded with food / beverage / damage / service / misc / room_upsale / extra_guest. Items grouped under these. |
| **charge_items** | `id`, `category_id`, `name`, `default_price`, `description`, `is_active`, `display_order` | The "menu" — restaurant items, towel-damage rates, etc. Managed at `/settings/charge-catalog`. |
| **checkouts** | `id`, `booking_id` (UNIQUE), `status` (CheckoutStatus), `advance_amount`, `charges_total`, `payments_total`, `net_due` (gen), `refund_amount`, `refund_expense_id` (FK), `discount_amount`, `discount_pct`, `discount_reason`, `actual_adults`, `actual_children`, `guest_reduction_reason`, `finalized_at`, `voided_at`, `void_reason` | One per booking. Lazily created on first charge via `getOrCreateDraftCheckout`. Generated `net_due` is the simple `(charges − advance − payments)` form; the **correct** net-due (incl. booking total + discount) is computed in TS via `lib/checkout/totals.ts::calcNetDue` because the booking total isn't part of the snapshot. |
| **checkout_charges** | `id`, `checkout_id`, `category_id`, `charge_item_id` (NULL for free-form), `description` (snapshot), `quantity`, `unit_price`, `amount` (gen), `notes`, `added_by` | Each line item. `room_upsale` and `extra_guest` charges price from the booking's `package_snapshot.room_prices` / `extra_person`. Multiplied by remaining nights for night packages. |
| **checkout_payments** | `id`, `checkout_id`, `amount`, `method` (CheckoutPaymentMethod), `reference`, `paid_at`, `recorded_by` | Multi-row, supports split-tender (cash + bKash, etc.). |

### Net-due math (the formula that matters)

```
total_due  = booking.total + sum(checkout_charges) − checkout.discount_amount
balance    = total_due − booking.advance_paid − sum(checkout_payments)

balance > 0 → "Remaining Due"  (guest owes — most common)
balance = 0 → "Settled"
balance < 0 → "Refund Due"     (resort owes — refund tracked as expense)
```

The DB-generated `checkouts.net_due` column does NOT include `booking.total` (it's a lightweight col, kept for backwards compat). Always use `calcNetDue` in `lib/checkout/totals.ts` for the user-facing number.

### Database functions
- `get_availability_range(p_from, p_to)` — RPC returning `{ check_date, check_room_type, qty_booked }[]` for fast calendar rendering.
- `get_expense_daily_pivot(p_from, p_to)` — RPC returning `{ expense_date, category_id, category_slug, daily_total }[]` (long-form). The query layer pivots wide in JS for the Excel-style monthly report. Filters `is_draft=false`.

### Generated columns
`bookings.nights = check_out_date - visit_date` (NULL for daylong).
`bookings.total = subtotal - discount`.
`bookings.due_advance = max(0, advance_required - advance_paid)`.
`bookings.remaining = max(0, total - advance_paid)`.
Same on `quotes`. **Never INSERT/UPDATE these columns directly — DB rejects.**

### Fixed room number map (in `lib/config/rooms.ts`, NOT the DB)
```ts
ROOM_NUMBERS: {
  super_premium:  ['101'],
  premium:        ['102'],
  cottage:        ['103', '104', '105', '106', '107'],
  premium_deluxe: ['108'],
  deluxe:         ['202', '203', '205', '206', '301', '302'],
  eco_deluxe:     ['204', '207'],
  // tree_house: no fixed numbers (open-air)
}
```
This is the source of truth for which physical rooms can be assigned. `booking_rooms.room_numbers` and `quote_rooms.room_numbers` store the assignments.

---

## 4. Repository layout

```
app/
  (agent)/                  # Auth-required routes (uses LayoutShell with Sidebar)
    page.tsx                # Dashboard /
    quotes/
      page.tsx              # /quotes — list
      QuotesClient.tsx      # client filters / table
      new/page.tsx          # /quotes/new
      [id]/page.tsx         # /quotes/[id] — detail
      [id]/edit/page.tsx
      [id]/print/page.tsx
      [id]/print/PrintTrigger.tsx
    bookings/
      page.tsx, BookingsClient.tsx
      [id]/page.tsx, [id]/print/page.tsx
    packages/
      page.tsx, [id]/page.tsx, new/page.tsx
    availability/page.tsx   # Room availability calendar
    analytics/page.tsx      # Revenue analytics (booking-side)
    expenses/                # Expense / accounts module
      page.tsx               # /expenses — list with filters + inline edit/delete + viewable receipts
      ExpensesClient.tsx     # (no — page.tsx is server-rendered; client widgets are separate)
      new/page.tsx           # /expenses/new — single entry with quick-add modals + pending-receipts
      bulk/page.tsx          # /expenses/bulk — Excel-style daily entry (one card per category)
      [id]/page.tsx          # /expenses/[id] — detail with receipts gallery
      [id]/DeleteExpenseButton.tsx
      [id]/edit/page.tsx
      categories/page.tsx    # /expenses/categories — admin (CRUD; toggle-active not delete)
      payees/page.tsx        # /expenses/payees — admin
      report/page.tsx        # /expenses/report — Excel-style monthly pivot
      report/MonthSelectorBar.tsx
      report/print/page.tsx  # /expenses/report/print — auto-printable, A3 landscape
      report/print/PrintTrigger.tsx
      analytics/page.tsx     # /expenses/analytics — KPIs + charts + P&L (joins booking revenue)
      budgets/page.tsx       # /expenses/budgets
      budgets/BudgetTabs.tsx
      recurring/page.tsx     # /expenses/recurring — template CRUD + draft generation
      drafts/page.tsx        # /expenses/drafts — confirm/discard auto-generated drafts
    hr/                      # HR module (sky accent)
      page.tsx               # /hr — dashboard tiles + headcount
      employees/
        page.tsx              # list + filter + show-terminated toggle
        EmployeesClient.tsx   # filter bar
        new/page.tsx
        [id]/page.tsx         # tabbed detail (Profile / Salary / Attendance / Leaves / Loans / Adjustments / Payroll)
        [id]/edit/page.tsx
        [id]/EmployeeDetailTabs.tsx
      attendance/page.tsx, attendance/AttendanceClient.tsx
      leaves/page.tsx, leaves/InitializeYearButton.tsx
      leaves/types/page.tsx   # admin: edit leave_types
      loans/page.tsx
      service-charge/page.tsx, service-charge/MonthBar.tsx
      payroll/page.tsx, payroll/PayrollClient.tsx
    checkout/                # Guest checkout module (violet accent)
      page.tsx               # /checkout — list (Today / Drafts / Finalized / All)
      CheckoutListClient.tsx
      [bookingId]/page.tsx   # focused checkout flow
    settings/                # Settings hub (slate accent)
      page.tsx               # 4 hub tiles + General + Holidays
      users/page.tsx, users/UsersClient.tsx, users/new/page.tsx, users/[id]/page.tsx
      roles/page.tsx, roles/[slug]/page.tsx
      charge-catalog/page.tsx
      duplicate-bookings/page.tsx     # Find + cancel duplicate bookings
      audit-log/page.tsx              # admin_alerts surface — discount/void/refund/etc.
    layout.tsx              # Auth check → fetches user + permissions + unread-alert count
  403/page.tsx              # "Access denied" page (redirected by middleware)
  api/                      # Public API routes (no auth check; middleware handles it)
    availability/route.ts
    booked-room-numbers/route.ts
    daily-report/route.ts
    date-change-preview/route.ts
    overlapping-bookings/route.ts
    revenue/route.ts         # used by RevenueWidget
    room-noon-notice/route.ts
    expenses/
      monthly-summary/route.ts, pl/route.ts, category-breakdown/route.ts,
      daily-trend/route.ts, csv-export/route.ts, [id]/attachments/route.ts
    checkout/
      catalog/route.ts        # GET — lazy-load charge_categories + charge_items for Add-Charge modal
      [id]/invoice/route.ts   # GET — streams the PDF invoice (@react-pdf/renderer)
  auth/signout/route.ts
  login/page.tsx, login/LoginForm.tsx, login/actions.ts, login/diagnose/page.tsx
  layout.tsx                # Root layout

components/
  analytics/AnalyticsClient.tsx
  availability/AvailabilityCalendar.tsx, AvailabilityGrid.tsx
  bookings/BookingActions.tsx          # The big edit/cancel/swap/change-dates panel
          BookingTable.tsx
          BookingWhatsAppOutput.tsx
          ChangeDatesModal.tsx          # Date change with availability preview
          SwapRoomsModal.tsx            # 3-tab room swap (reassign / swap / type+charge change)
  dashboard/QuickActions.tsx, RecentQuotes.tsx, RevenueWidget.tsx, StatsCards.tsx,
            ExpensesThisMonth.tsx,      # Rose card: this-month total + MoM delta + draft count
            MonthlyPnLWidget.tsx         # Revenue / Expenses / Profit 3-col card
  expenses/
    AttachmentsViewerButton.tsx        # Click paperclip in list → modal with signed-URL previews
    BudgetManager.tsx                  # Budget table with editable inputs + progress bars
    CategoryManager.tsx                # Categories CRUD with deactivate
    DailyExpenseGrid.tsx               # Excel-style bulk entry, one card per active category
    DraftConfirmCard.tsx               # One per pending draft, editable amount + confirm/discard
    ExpenseAnalyticsClient.tsx         # KPIs, charts, P&L panel for /expenses/analytics
    ExpenseFilters.tsx                 # Date / category / payee / method / search row
    ExpenseForm.tsx                    # Single-entry form (create + edit), pending-receipts uploader
    ExpenseRowActions.tsx              # Inline edit/delete buttons on the list table
    ExpenseTable.tsx                   # Server-rendered list table
    MigrationErrorBanner.tsx           # Friendly fallback when expense tables / RPC are missing
    MonthlyExcelGrid.tsx               # The pivot table itself (sticky date col, day-total col)
    PayeeManager.tsx                   # Payees CRUD with deactivate + type filter
    QuickAddCategoryModal.tsx          # In-flow create from new-expense form (auto-slug)
    QuickAddPayeeModal.tsx
    ReceiptThumbnails.tsx              # Server component — pre-signs URLs
    ReceiptThumbnailsClient.tsx        # Renders the gallery + remove buttons
    ReceiptUploader.tsx                # Drag-drop browser uploader (used on /expenses/[id]/edit)
    RecurringTemplatesList.tsx         # Templates table + Generate-Drafts button
    labels.ts                          # PAYMENT_METHOD_LABELS, PAYEE_TYPE_LABELS, CATEGORY_GROUP_BADGE etc.
  hr/                                  # HR module (sky accent)
    EmployeeForm.tsx, EmployeeTable.tsx, SalaryStructureForm.tsx
    AttendanceGrid.tsx, LeaveBalanceTable.tsx, LeaveTypeManager.tsx
    LoansTable.tsx, LoanForm.tsx
    AdjustmentForm.tsx, AdjustmentsList.tsx
    ServiceChargeForm.tsx, PayrollPreviewTable.tsx
    TerminateEmployeeButton.tsx, MigrationErrorBanner.tsx, labels.ts
  checkout/                            # Guest-checkout module (violet accent)
    BookingChargesTab.tsx              # Mounted on /bookings/[id] AND /checkout/[bookingId]
    AddChargeModal.tsx                 # 3 tabs: Catalog (lazy-loaded) / Room+Guest upsale / Free-form
    ChargeCatalogClient.tsx            # /settings/charge-catalog admin
    CheckoutSummary.tsx                # Sticky bill summary card
    PaymentForm.tsx                    # Add-payment row, supports split-tender
    FinalizeAndVoid.tsx                # Action panel: Finalize / Refund / Void / PDF
    DiscountButton.tsx, DiscountModal.tsx
    GuestCountAdjustButton.tsx         # Audit-only — pure record, no billing change
    MigrationErrorBanner.tsx, labels.ts
  analytics/AnalyticsClient.tsx, UpsalesPanel.tsx   # Upsales section appended to /analytics
  layout/LayoutShell.tsx, Sidebar.tsx, Topbar.tsx
  packages/PackageForm.tsx, PackageTable.tsx, RoomPriceEditor.tsx, TextBlockEditor.tsx
  print/PrintLayout.tsx
  quotes/CopyButton.tsx, GuestInputs.tsx, PackageSelector.tsx, PricingBreakdown.tsx,
         QuoteActions.tsx, QuoteForm.tsx, QuoteTable.tsx, RoomSelector.tsx, WhatsAppOutput.tsx
         DuplicateConfirmModal.tsx     # Soft-warn modal on quote/booking duplicate detection
  settings/HolidayManager.tsx, SettingsForm.tsx
    UserForm.tsx, UsersTable.tsx, UserDetailActions.tsx
    PermissionGrid.tsx, RoleCard.tsx
    DuplicateBookingsTable.tsx, AuditLogClient.tsx
  ui/Badge.tsx, Button.tsx, Card.tsx, DateRangePicker.tsx, Input.tsx, Modal.tsx,
     NumberInput.tsx, Select.tsx, Tabs.tsx, Textarea.tsx, WhatsAppLink.tsx

lib/
  actions/                  # Server actions ('use server')
    bookings.ts             # convertQuoteToBooking, updateAdvancePaid, cancelBooking,
                            # updateBooking, confirmDateChange, swapRoomAssignment
    quotes.ts               # createQuote, updateQuote, sendQuote, confirmQuote,
                            # cancelQuote, deleteQuote
    packages.ts             # createPackage, updatePackage, deletePackage, togglePackageActive
    settings.ts             # updateSettings, addHoliday, removeHoliday
    expenses.ts             # All expense CRUD + drafts/budgets/recurring (see file)
    employees.ts            # createEmployee (auto-creates expense_payees row), updateEmployee,
                            # terminateEmployee, reactivateEmployee, setSalaryStructure
    attendance.ts           # markAttendance (with leave-balance sync), bulkMarkAttendance
    leaves.ts               # initializeLeaveBalances(year), createLeaveType, updateLeaveType,
                            # toggleLeaveTypeActive, adjustLeaveBalance
    loans.ts                # createLoan, closeLoan, writeOffLoan
    salary-adjustments.ts   # createAdjustment, deleteAdjustment
    service-charge.ts       # upsertServiceCharge, deleteServiceCharge
    payroll.ts              # previewPayrollRun (read-only), saveDraftPayrollRun,
                            # finalizePayrollRun (snapshots + writes salary expenses + closes loans)
    users.ts                # createUser (uses service-role admin client), updateUser,
                            # resetPassword, deactivateUser, reactivateUser, changeRole.
                            # Last-active-admin guard prevents self-lockout.
    roles.ts                # updateRolePermissions (with admin-settings lock)
    charge-catalog.ts       # CRUD for charge_categories + charge_items
    checkout-charges.ts     # getOrCreateDraftCheckout, addCharge, updateCharge, removeCharge
    checkout.ts             # addPayment, removePayment, finalizeCheckout, voidCheckout (admin-only),
                            # recordRefund (auto-writes Guest Refund expense),
                            # applyDiscount + clearDiscount, adjustActualGuestCount,
                            # acknowledgeAlert
    types.ts                # ActionResult, ActionData (with optional `duplicate` payload)
  auth/
    permissions.ts          # getCurrentUserContext (cached), hasPermission, requirePermission,
                            # checkPermission, isAdmin
    alerts.ts               # flagAlert (best-effort admin_alerts insert), getUnreadAlertCount
  checkout/totals.ts        # calcChargesTotal, calcPaymentsTotal, calcNetDue (the canonical formula)
  config/rooms.ts           # ROOM_NUMBERS map + nextDay + dateRangesOverlap helpers
  engine/                   # Pure functions (no DB calls)
    availability.ts         # checkRoomAvailability(inventory, occupied, packageType?)
    calculator.ts           # calculateDaylong, calculateNight, recalculate
    meals.ts                # Daily meal counts for kitchen reports
    package-resolver.ts     # resolvePackage(date, type, packages)
    snapshot.ts             # buildPackageSnapshot, snapshotToRates
    payroll.ts              # computePayrollLine — per-employee net pay computation
  formatters/
    currency.ts             # formatBDT, formatBDTSigned, parseBDT
    dates.ts                # formatDate, formatDateRange, formatDateShort, toISODate,
                            # isFriday, isHoliday, getDayType, computeNights
    phone.ts                # WhatsApp phone formatting
    whatsapp.ts             # formatWhatsApp(WhatsAppParams)
  pdf/
    invoice.tsx             # @react-pdf/renderer Document — A4 invoice w/ logo, discount, totals
  queries/                  # DB read functions (server-only)
    analytics.ts            # Booking-side analytics (getTotalsSummary, getDailyRevenue, etc.)
    availability.ts         # checkAvailabilityConflict, getRoomAvailability, getBookedRoomNumbers
    bookings.ts             # getBookings, getBookingById, getUpcomingBookings, getBookingStats
    daily-report.ts         # Per-date kitchen / housekeeping breakdown
    expenses.ts             # All expense reads (see file — many)
    duplicate-bookings.ts   # findDuplicateBookings (used at create time as soft-warn) +
                            # findAllDuplicateGroups (Settings audit page)
    employees.ts            # getEmployees, getEmployeeById, getCurrentSalary, getSalaryHistory,
                            # getEmployeeStats, suggestEmployeeCode
    attendance.ts           # getAttendanceForDate, getAttendanceMapForDate,
                            # getAttendanceForMonth, summariseAttendanceForMonth, getActiveEmployeesForGrid
    leaves.ts               # getActiveLeaveTypes, getAllLeaveTypes, getLeaveBalancesForYear,
                            # getEmployeeLeaveBalances
    loans.ts                # getLoans, getActiveLoansForEmployee
    salary-adjustments.ts   # getAdjustmentsForEmployee, getAdjustmentsForMonth + sum helpers
    service-charge.ts       # getServiceChargesForMonth, getServiceChargeForEmployeeMonth
    payroll.ts              # getPayrollRuns, getPayrollRunByPeriod, getPayrollLinesForEmployee
    users.ts                # listUsers, getUserById, countActiveAdmins
    roles.ts                # listRoles, listModules, getRoleWithPermissions, getRoleHeadcounts
    charge-catalog.ts       # listChargeCategories, listChargeItems, getChargeItemById
    checkout.ts             # getCheckoutByBooking, getChargesByCheckout, getPaymentsByCheckout,
                            # getCheckoutFull, listCheckoutCandidates (for /checkout list)
    upsales.ts              # getUpsalesSummary — aggregates checkout_charges for /analytics
    admin-alerts.ts         # listAdminAlerts (filtered by event_type / unread)
    packages.ts             # getPackages, getPackageById, getActivePackages
    quotes.ts               # getQuotes, getQuoteById, getRecentQuotes, getQuoteStatusCounts
    settings.ts             # getSettings, getHolidayDates, getHolidayDateStrings, getRoomInventory
  sidebar-context.tsx       # Mobile drawer open/close context
  supabase/
    client.ts               # Browser-side Supabase client
    middleware.ts           # createMiddlewareClient — used in middleware.ts
    server.ts               # createClient() + createServiceClient() (admin-key, server-only)
    types.ts                # ALL TS types (single source of truth, no separate db.ts)
  utils.ts                  # cn (tailwind-merge), generateQuoteNumber, generateBookingNumber
  validators/
    booking.ts, package.ts, quote.ts   # Zod schemas matching the form inputs
    expense.ts                          # Expense, daily-bulk, category, payee, budget, template
    employees.ts                        # employeeFormSchema, salaryStructureFormSchema, terminationSchema
    hr.ts                               # markAttendance / loanForm / adjustmentForm / serviceCharge / leaveType
    users.ts, roles.ts                  # User mgmt + role permission editor schemas
    checkout.ts                         # addCharge, addPayment, voidCheckout, applyDiscount,
                                        # adjustGuestCount, recordRefund, chargeItem, chargeCategory

middleware.ts               # Route guard: session refresh, unauth → /login (or 401 JSON for /api/*).
                            # Module-level read check after auth: maps URL prefix → ModuleSlug,
                            # redirects to /403?from=<module> if user lacks read.
                            # Deactivated users get force-signed-out on next request.

migrations/
  expense-module/           # SQL — paste into Supabase SQL Editor in order:
    000_extend_entity_type_enum.sql, 001_expense_schema.sql,
    002_seed_categories_and_payees.sql, 003_expense_pivot_rpc.sql, 004_storage_bucket.sql
  hr-module/
    000_create_hr_tables.sql             # 10 tables, seed leave_types, history_log CHECK extension
  auth-roles-module/
    000_create_roles_and_permissions.sql # roles + modules + role_permissions + user_profiles +
                                         # backfill existing auth.users → admin
    001_add_availability_module.sql      # Carve `availability` module out of `bookings`,
                                         # demote front_desk's bookings permission to 'none'
  checkout-module/
    000_create_checkout_tables.sql       # charge_categories + items + checkouts + charges + payments,
                                         # also extends bookings.status to allow 'checked_out'
    001_add_discount_and_alerts.sql      # checkout discount fields + admin_alerts table
    002_add_extras_categories_and_guest_actual.sql  # room_upsale + extra_guest categories,
                                                    # actual_adults/children fields on checkouts
```

---

## 5. Core domain concepts

### 5.1 Quote → Booking lifecycle

```
DRAFT (quote created)
  → SENT (quote shared with customer; usually via WhatsApp text)
  → CONFIRMED (customer agrees) → quote.converted_to_booking_id is populated
                                → BOOKING is created mirroring the quote
  → CANCELLED (either side)
```

The quote's `package_snapshot` is built at creation and copied verbatim into the booking. From booking-creation time onward, **the original Package row is irrelevant to that booking**. All recalculations use `booking.package_snapshot`.

### 5.2 Pricing (calculator) — `lib/engine/calculator.ts`

Two pure functions: `calculateDaylong(inputs)` and `calculateNight(inputs)`.

**Daylong:**
- Adults charged at the day's resolved rate (Friday rate > Holiday rate > Weekday rate, picking the highest precedence that matches).
- Children (paid, ages 4-9): flat `child_meal` per child.
- Drivers: flat `driver_price` per driver.
- Rooms: `qty × unit_price`. **Rows with `unit_price === 0` are skipped (complimentary).**
- Extra items, service charge %, flat discount, percentage discount.

**Night:**
- Base includes 2 persons per room. Extra persons (`adults - 2 × roomQty`) charged at `extra_person × nights`.
- Children meal: `child_meal × nights`.
- Drivers, extra beds: `× nights`.
- Rooms: `qty × unit_price × nights`. **`unit_price === 0` skipped here too (defensive).**
- Same service charge / discount mechanics.

Both return `CalculationResult` containing `line_items[]`, `subtotal`, `discount` (effective = flat + pct), `total`, `advance_required`, `advance_paid`, `due_advance`, `remaining`, `adult_rate_used`, `nights`.

### 5.3 Adult rate resolution
```
isFriday(date)  → friday_adult     ('friday')
isHoliday(date) → holiday_adult    ('holiday')
otherwise       → weekday_adult    ('weekday')
```
For night stays, the rate is resolved from the **check-in** date and applied to all nights.

### 5.4 Availability — `lib/queries/availability.ts`

`checkAvailabilityConflict(visitDate, checkOutDate, requestedRooms, excludeBookingId?)`:
- Iterates each date in the range (daylong → just visitDate; night → [visitDate, checkOutDate)).
- For each date, sums `qty` from all non-cancelled `booking_rooms` rows where the booking's date range covers that date, plus confirmed (not-yet-converted) `quote_rooms`.
- Compares against `room_inventory.total_units`. Returns conflict message or `null`.
- `excludeBookingId` lets the current booking exclude itself when changing dates / swapping.
- **Comp rows count toward occupancy** — a comp room still occupies a physical room.

`getBookedRoomNumbers(visitDate, checkOutDate, excludeBookingId?)`:
- Returns a flat list of all room numbers (e.g. `['202', '301']`) assigned to overlapping bookings.
- Used to grey out taken numbers in the room-number picker.

### 5.5 Room number assignment

- Each `booking_rooms` / `quote_rooms` row stores `room_numbers: string[]` of length `≤ qty`.
- Picker UI: `ROOM_NUMBERS[room_type]` buttons; numbers in `bookedRoomNumbers` (other bookings) are disabled.
- A booking with paid + comp of the same type produces TWO rows. The picker disables numbers selected by the other row in the same booking (locally-taken set).
- `tree_house` has no fixed numbers → no picker shown.

### 5.6 Complimentary rooms (recent feature)

- Stored as `booking_rooms`/`quote_rooms` rows with `unit_price = 0`.
- Same `room_type` can have a paid row AND a comp row in one booking.
- Comp rooms get full assignment parity: room numbers, availability blocking, swaps, type changes.
- Daylong-only by spec (UI hides comp section for night packages); calculator defensive in either case.
- WhatsApp output renders a separate `🎁 COMPLIMENTARY ROOMS` section after `🏨 ROOMS`.
- UI accent: emerald (vs forest for paid).

### 5.7 Room swap (recent feature) — `lib/actions/bookings.ts::swapRoomAssignment`

Three modes, all targeting **specific `booking_rooms.id` rows** (not by `room_type`, since the same type can have two rows):

```ts
type SwapInput =
  | { mode: 'reassign'
      booking_room_id: string
      new_room_numbers: string[] }
  | { mode: 'swap'
      target_booking_id: string
      source_booking_room_id: string
      target_booking_room_id: string
      source_new_numbers: string[]
      target_new_numbers: string[] }
  | { mode: 'type_change'
      booking_room_id: string
      to_room_type: RoomType
      to_charge_mode: 'paid' | 'comp'      // bidirectional paid ↔ comp conversion
      new_room_numbers: string[] }
```

`type_change` recalculates the entire booking's totals (drops/raises subtotal). If the new total < `advance_paid`, the modal shows an over-collected warning (manual refund expected — no money movement is automated).

Race-condition safe: re-checks `getBookedRoomNumbers` and own-booking `booking_rooms` rows immediately before UPDATE.

### 5.8 Date change (recent feature) — `lib/actions/bookings.ts::confirmDateChange`

Confirmed bookings only. Server action:
1. Re-checks availability with `excludeBookingId = bookingId`.
2. Recalculates totals using frozen `package_snapshot` and the new dates.
3. Updates `bookings.visit_date`, `check_out_date`, `subtotal`, `discount`, `line_items` (the DB regenerates `nights`, `total`, `remaining`).
4. Per-room: caller passes `cleared_room_numbers` (room types whose assignments conflict on the new dates → cleared to `[]`).
5. Logs `event: 'edited'` with `payload.action: 'dates_changed'`.

The `/api/date-change-preview` endpoint runs the same check + recalc and returns the result without committing — feeds the modal preview.

### 5.9 Expense module

The expense module is structurally separate from the booking/quote system but joins it for Profit & Loss. Key design points:

- **Two entry workflows**: single (`/expenses/new`, one transaction) and bulk (`/expenses/bulk`, the daily Excel-style — one card per active category with optional multi-line for misc/beverages/housekeeping). The bulk form is the primary daily workflow that replaced an Excel "Bazar Expense" sheet.
- **Drafts vs real expenses**: `expenses.is_draft = true` rows are auto-generated from recurring templates (salary / wifi / electricity) on the `day_of_month` configured per template. Drafts are excluded from every analytics query and the monthly report until confirmed via `confirmDraftExpense` (sets `is_draft=false` with optional amount/method overrides) or removed via `discardDraftExpense`. Idempotency: each template stores `last_generated_for` (first-of-month date); `generateMonthlyDrafts` only fires templates where `last_generated_for IS NULL OR < period_start`.
- **Categories & payees are soft-deleted** via `is_active`. Hard delete is forbidden because expenses reference them. The slug locks once a category has any expenses.
- **Quick-add modals** on `ExpenseForm` and `DailyExpenseGrid` (`<QuickAddCategoryModal>`, `<QuickAddPayeeModal>`) let users create new categories/payees mid-flow without losing form state. Local component state appends the new item and auto-selects it; `router.refresh()` syncs the server.
- **Receipt attachments** (`expense_attachments` + Supabase Storage `expense-receipts` bucket): browser uploads the file directly to Storage, then the `attachReceipt` server action records the metadata row. The bucket is **private**; rendering uses short-lived signed URLs minted server-side via `getSignedAttachmentUrl`. Two upload surfaces: live uploader on `/expenses/[id]/edit` and a queue-then-batch picker on `/expenses/new` (files stay in client state, upload after `createExpense` returns the new id).
- **Budgets**: per `(category_id, period_type, period_start)` triple, with two partial unique indexes (one for category-scoped, one for `category_id IS NULL` "overall"). `getBudgetVsActual` joins each budget against same-period non-draft expenses and returns variance + `pct_consumed`.
- **Profit & Loss**: `getProfitAndLoss(from, to)` joins `bookings` (revenue side: `total`, `advance_paid`, `remaining`) with `expenses` (outflow). Reports both gross profit (accrual: `booking_revenue − expenses.total`) and cash net (`booking_collected − expenses.total`). Cancelled bookings excluded; revenue attributed to `visit_date`.
- **Monthly report** = pivot of `get_expense_daily_pivot` RPC. Columns are active categories in `display_order` (stable month-to-month even on zero-spend days); rows are each day of the month; the right-hand column is per-day total; the footer is per-column totals + grand total. Empty cells are blank, not "0", to match the Excel original.
- **CSV export** at `/api/expenses/csv-export?from=&to=&...` streams an RFC-4180 file with `Content-Disposition: attachment`. Used from the report page's "Export CSV" button.
- **Inline edit / delete** on the list table via `<ExpenseRowActions>` — pencil routes to `/expenses/[id]/edit`, trash opens a confirm modal with the amount + category + date so the user sees what's being deleted.
- **Audit logging is best-effort.** `logHistory` in `lib/actions/expenses.ts` swallows errors so a missing or misconfigured `history_log` table doesn't take down create/update/delete operations.

#### Resilience to unmigrated DBs

Every expense page wraps its data fetch in try/catch and renders `<MigrationErrorBanner>` (with a numbered checklist of which SQL files to run) instead of crashing. Important when shipping the module to a fresh project — the app stays loadable until the operator runs migrations. The dashboard widgets (`<ExpensesThisMonth>`, `<MonthlyPnLWidget>`) silently render `null` if the tables aren't there.

---

## 6. WhatsApp output (`lib/formatters/whatsapp.ts`)

Single function `formatWhatsApp(p: WhatsAppParams) → string` produces the entire copy-paste message for both quotations and booking confirmations. Sections (in order):
```
━━━━━━━━━━━━━━━━━━
🌿 GARDEN CENTRE RESORT
✨ QUOTATION / BOOKING CONFIRMATION #...
━━━━━━━━━━━━━━━━━━
📌 Package, 👤 Name, 📞 Contact, 📅 Date, 🕐 Check-in/out
━━━━━━━━━━━━━━━━━━
🏨 ROOMS              # rows where unit_price > 0
🎁 COMPLIMENTARY ROOMS   # rows where unit_price === 0 (only if any)
⚠️ Note: Room available after 12:00 PM   # only if a previous-night guest checks out same day
━━━━━━━━━━━━━━━━━━
👥 GUESTS
━━━━━━━━━━━━━━━━━━
💰 PRICING BREAKDOWN
   ...line items...
   Subtotal / Discount / *Total* / Advance Required / Advance Paid / *Remaining*
🍽️ MEALS / 📝 NOTES (if present)
━━━━━━━━━━━━━━━━━━
💳 PAYMENT (settings.payment_instructions)
📞 (settings.contact_numbers)
(settings.whatsapp_footer_text)
━━━━━━━━━━━━━━━━━━
```

Date format: `formatDate` returns `"Saturday, 11 Apr 2026"` everywhere. `formatDateRange` is `Saturday, 11 Apr 2026 → Monday, 13 Apr 2026 (2 nights)`.

The QuoteForm has its own inline preview (a near-duplicate of `formatWhatsApp` for live-as-you-type editing); on the booking detail page, `BookingWhatsAppOutput.tsx` calls the canonical `formatWhatsApp`.

---

## 7. Auth & middleware

- **Authentication:** Supabase email+password. Admin creates users via Supabase Dashboard → Authentication → Users → Add User → Create New User (NOT "Send Invitation"). "Confirm email" must be OFF in Email provider settings.
- **Session:** SSR cookies via `@supabase/ssr`. Login is a server action (`app/login/actions.ts`) — runs server-side to avoid CORS and ensure env vars are present.
- **Middleware (`middleware.ts`):**
  - Refreshes session cookie on every request via `supabase.auth.getUser()`.
  - Public paths: `/login`, `/login/*`, `/auth/*`. Everything else requires auth.
  - Unauthenticated `/api/*` → 401 JSON. Unauthenticated page → 302 to `/login?next=...`.
  - If `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing → redirect to `/login/diagnose` (a no-auth page that shows env health and Supabase reachability).
- **Sign out:** `app/auth/signout/route.ts` POST → `supabase.auth.signOut()` → 303 to `/login`. Linked from Sidebar footer.

### Required env vars
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...    # or legacy eyJ... JWT
SUPABASE_SERVICE_ROLE_KEY=...                       # server actions use the user's session, not service role; this is for any future privileged ops
```

---

## 8. Existing modules summary

### 8.1 Dashboard (`/`)
- `StatsCards`: quote status counts, booking count, revenue, pending advance.
- `RecentQuotes`: latest 5 quotes.
- `QuickActions`: shortcuts to "New Quote".
- `RevenueWidget`: 30-day default range with date inputs + "Last 7d / 30d / 90d" presets, calls `/api/revenue` (`getRevenueStats`).
- `MonthlyPnLWidget`: this-month Revenue / Expenses / Profit in a 3-col card, links to `/expenses/analytics`.
- `ExpensesThisMonth`: rose card — this-month total, MoM delta with up/down arrow, pending-draft count badge.
- `Upcoming Bookings`: next 5 confirmed bookings.

### 8.2 Quotes (`/quotes`)
- List with status filter, search, table.
- New quote form (`QuoteForm.tsx`): customer, package selector, date(s), rooms (paid + comp), guests, pricing adjustments, extra items, advance payment, live pricing preview + WhatsApp draft.
- Detail page: header + actions (send / confirm / cancel / convert / edit / delete / print / open WhatsApp), pricing breakdown, WhatsApp output.
- Edit form (re-uses QuoteForm with `initialValues`).
- Print page (uses `react-to-print`).

### 8.3 Bookings (`/bookings`)
- List with status / date-range filters.
- Detail page (`bookings/[id]/page.tsx`): customer / package / dates / guests / rooms (paid + comp visually distinguished) / pricing breakdown / WhatsApp output / `BookingActions` panel.
- `BookingActions`: edit modal (full re-edit), update payment, change dates (modal), swap rooms (3-tab modal), cancel.
- Print page.

### 8.4 Packages (`/packages`)
- CRUD on packages and their per-room-type prices.
- Validity: all-year, date range, or specific dates. `is_override` flag promotes a package over regulars on overlapping dates.
- Text blocks: `meals`, `activities`, `experience`, etc., baked into the WhatsApp output via `package_snapshot`.

### 8.5 Availability (`/availability`)
- Calendar view (month grid), per-day occupancy bar per room type. Uses `get_availability_range` RPC for speed.

### 8.6 Settings (`/settings`)
Hub with 4 tiles + General + Holidays cards. Permission-gated by `settings:read`.

| Sub-route | Purpose |
|---|---|
| `/settings` | Hub — 4 tiles (Users, Roles, Charge Catalog, Duplicate Bookings) + General KV settings + Holiday manager |
| `/settings/users` + `/new` + `/[id]` | User mgmt — admin creates accounts via service-role `auth.admin.createUser`, shows temp password ONCE on success. Per-user actions: edit profile, change role, reset password, deactivate / reactivate. Last-active-admin guard. Self-deactivate guard. |
| `/settings/roles` + `/[slug]` | 4 role cards with headcount + permission-chip strip. Slug page hosts the `<PermissionGrid>` (rows = modules, cols = none/read/write radios). Diff-confirm modal before save. Admin's `settings` cell locked at `write`. |
| `/settings/charge-catalog` | Restaurant menu / damage rates / misc charges. Items grouped by category; inline add + toggle-active. |
| `/settings/duplicate-bookings` | Audit page — finds groups of bookings with the same `(phone, visit_date, package_type)`. Per-row Cancel button. |
| `/settings/audit-log` | `admin_alerts` surface — discount applied / guest reduced / void / refund / cancellation / deactivation. Filters by event type. Acknowledge button per row; unread count drives the Settings sidebar badge. |

### 8.7 Analytics (`/analytics`)
- Server component with URL state (`?from=&to=`), default = current month.
- Client (`AnalyticsClient.tsx`): `DateRangePicker` with presets (This month / Last month / This quarter / This year), 4 KPI cards, 3 chart sections (daily-revenue / package-breakdown / room-utilization).
- Excludes cancelled bookings. Attributes revenue to `visit_date` (not `created_at`).
- **Upsales section appended** (`<UpsalesPanel>`): aggregates `checkout_charges` over the same date range — total, by-category, top 10 items, by-staff. Best-effort — silently hidden if checkout module isn't migrated.
- "Print / Save as PDF" button uses browser native printing.

### 8.8 Expenses (`/expenses` — full module)

| Sub-route | Purpose |
|---|---|
| `/expenses` | Filtered list (date range / category / payee / method / search), per-row inline edit + delete + clickable paperclip viewer, pending-drafts banner if drafts > 0 |
| `/expenses/new` | Single-entry form with quick-add modals next to category & payee dropdowns, queued-receipt picker that uploads after `createExpense` returns |
| `/expenses/bulk` | Excel-style daily entry — one card per active category, multi-line for description-required categories, day-total banner, atomic save |
| `/expenses/[id]` | Detail page: rose-accented amount header, all fields, receipts gallery (server-side pre-signed URLs), Edit + Delete buttons |
| `/expenses/[id]/edit` | Same form as /new in edit mode + a live `<ReceiptUploader>` (file appears immediately) |
| `/expenses/categories` | Category CRUD with deactivate (no hard delete); slug locks once used |
| `/expenses/payees` | Payee CRUD with type filter |
| `/expenses/report` | Excel-style monthly pivot — month nav, summary stats, sticky-column grid; CSV + Print buttons |
| `/expenses/report/print` | Auto-printable A3 landscape; `@media print` hides sidebar/topbar |
| `/expenses/analytics` | KPIs + daily trend + category donut + payee bar + P&L panel (with by-group breakdown) |
| `/expenses/budgets` | Monthly/Annual tabs, period nav, editable budget inputs + actual + progress bar; Save + × delete per row |
| `/expenses/recurring` | Templates table with Pause/Resume/Edit/Delete; "Generate Drafts for <month>" button |
| `/expenses/drafts` | Per-draft cards with editable amount/description/method/reference; Confirm or Discard |

API:
| Route | Notes |
|---|---|
| `GET /api/expenses/monthly-summary?month=YYYY-MM` | Pivot for the report page |
| `GET /api/expenses/pl?from=&to=` | Profit & Loss |
| `GET /api/expenses/category-breakdown?from=&to=` | Donut + table data |
| `GET /api/expenses/daily-trend?from=&to=` | Bar chart data |
| `GET /api/expenses/csv-export?from=&to=&...` | Streams CSV download |
| `GET /api/expenses/[id]/attachments` | Signed URLs for the receipts viewer modal |

### 8.9 HR (`/hr` — full module, sky accent)

Mirrors the expense module's structure quality. Permission-gated by `hr:read`.

| Sub-route | Purpose |
|---|---|
| `/hr` | Dashboard — headcount stats + tile grid linking to all HR sub-modules |
| `/hr/employees` | Filterable list (search / department / show-terminated). Status badges. Strikethrough for terminated. |
| `/hr/employees/new` | Create form — auto-generates next `GCR-NNN` code. **Auto-creates a matching `expense_payees` row** linked via `expense_payee_id` (the integration spine for payroll → expenses). |
| `/hr/employees/[id]` | Tabbed detail — Profile / Salary / Attendance / Leaves / Loans / Adjustments / Payroll. Salary tab uses `<SalaryStructureForm>` which always closes the current effective-dated row before opening a new one. Termination button on the header (admin action). |
| `/hr/attendance` | Daily grid. One row per active employee, status-button cluster (Present / Absent / Paid Leave / Unpaid Leave / Weekly Off / Holiday / Half Day). "Mark all Present" bulk action. Re-marking the same date upserts. |
| `/hr/leaves` | Per-year balance pivot table. **Initialize Year** button seeds rows for every (active employee × active leave_type). |
| `/hr/leaves/types` | Admin: edit `leave_types` rules (default annual balance, paid flag, display order, active toggle). Slug locks once used. |
| `/hr/loans` | Multi-month loan ledger. Status lifecycle: active → closed (auto on full repay) / written_off (admin action). |
| `/hr/service-charge` | Per-staff per-month service-charge entry (manual). Picked up by payroll as an addition. |
| `/hr/payroll` | Monthly preview + finalize. Preview is read-only (live recompute). Finalize gated to "1st of next month onward". On finalize: snapshots the pay structure into `payroll_run_lines`, generates `loan_repayment` adjustments, increments + auto-closes loans, writes one `expenses` row per staff in the `salary` category against `employees.expense_payee_id`. |
| `/hr/sales` | Sales performance leaderboard. Date-range filter; KPIs (total attributed revenue / top rep / top team); per-rep table + per-team rollup. Aggregates `bookings` filtered to `confirmed`/`checked_out` joined to `employees.sales_employee_id`. |

**Payroll engine** (`lib/engine/payroll.ts::computePayrollLine`) — pure function. Formula:
```
unpaid_deduction = round( basic ÷ days_in_month × (days_unpaid_leave + days_absent + days_half_day × 0.5) )
net_pay = gross + bonuses + service_charge − unpaid_deduction − fines − advance − loan_deduction − other_deductions
```

### 8.10 Auth & Roles (foundation, slate accent)

Foundational module that gates every other one. See **Section 7** for auth flow.

- **`lib/auth/permissions.ts`** is the single source of truth. `getCurrentUserContext` is `cache()`-wrapped (one DB roundtrip per request even if called from multiple components). `requirePermission` redirects to `/403?from=<module>`. `checkPermission` returns `ActionResult` for server-action use.
- **Middleware** does a per-request module-read check: maps URL prefix → ModuleSlug, redirects to `/403` if denied. Deactivated users get force-signed-out.
- **Sidebar** permission-gates each nav link. Settings link gets a small dot badge when `admin_alerts` has unreads.
- **Service-role client** (`lib/supabase/server.ts::createServiceClient`) is used ONLY by user-management actions (`auth.admin.createUser`, `updateUserById` for password reset / ban). Never imported in client components.
- **`lib/auth/alerts.ts::flagAlert`** is the canonical helper for inserting `admin_alerts` rows. Best-effort — non-blocking on the user-facing operation, mirrors the `logHistory` pattern.

### 8.11 Checkout (`/checkout` — full module, violet accent)

| Sub-route | Purpose |
|---|---|
| `/checkout` | List — filters: Today / Drafts / Finalized / All. Pulls confirmed + checked-out bookings from the last 30 days, joined to their checkout row. |
| `/checkout/[bookingId]` | Focused workflow — guest header (incl. rooms, line items, package), Charges card (`<BookingChargesTab>`), Payments card, sticky `<CheckoutSummary>` on the right showing live net-due (Remaining / Refund / Settled). Side actions: Apply Discount / Adjust Guest Count / Finalize / Record Refund / Void (admin only) / Invoice PDF. |
| `/api/checkout/catalog` | GET — lazy-loaded by `<AddChargeModal>` so the detail page doesn't pay the catalog query cost on every render. |
| `/api/checkout/[id]/invoice` | GET — streams the PDF invoice via `@react-pdf/renderer`. Renders logo (best-effort: `public/logo.png`), discount line, totals block, signature lines. |

**Add Charge modal** has 3 tabs:
1. **From Catalog** — search + click + override price. Items pulled from `charge_items`.
2. **Room / Extra Guest** — pulls per-room-type prices from the booking's frozen `package_snapshot.room_prices` and per-extra-guest from `extra_person`. Multiplied by remaining nights for night packages. Saves as `room_upsale` / `extra_guest` charges.
3. **Free-form** — category + description + qty + price for one-offs.

**Charges + payments lock** when checkout becomes `finalized` or `voided`. Voiding is admin-only and reverts `bookings.status` to `confirmed`.

**Refund flow** — when `net_due < 0` after finalize, the action panel surfaces a "Record Refund Payout" button. `recordRefund` creates an `expenses` row in the `Guest Refund` category (auto-creating the category if it doesn't exist) and saves `refund_expense_id` back onto the checkout. Recording money movement is manual.

**Discount + guest reduction**: both flag an `admin_alerts` row (`event_type = 'discount_applied'` / `'guest_reduced'`) for review. Discount affects net-due; guest reduction is pure audit (no billing impact).

---

## 9. Conventions & patterns

### 9.1 Server Actions pattern
- File header: `'use server'`.
- Return `ActionResult` (`{ success: true } | { success: false; error: string }`) or `ActionData<T>`.
- After mutation: `revalidatePath('/...')` for affected pages.
- Insert a `history_log` row for non-trivial mutations.
- **Use `'edited'` event with `payload.action` discriminator** instead of adding new enum values.

### 9.2 API Routes pattern (read-only / preview helpers)
- Used for:
  - Live data that the client needs to fetch reactively (e.g. `/api/booked-room-numbers` while picking dates).
  - Preview endpoints that mirror a server action's logic without committing (e.g. `/api/date-change-preview`).
- Mutations always go through Server Actions, never API routes.

### 9.3 Form pattern
- `react-hook-form` + `zodResolver(schema)`.
- Schemas live in `lib/validators/*.ts`.
- For complex multi-stage state (room selections, complimentary rooms, extra items), use **separate `useState` slices outside react-hook-form** and merge before submit. See `QuoteForm.tsx` for the canonical example.

### 9.4 UI primitives
- `Button` — `variant: primary | secondary | danger | ghost | outline`, `size: sm | md | lg`, `loading`.
- `Input`, `NumberInput` (with prefix/suffix), `Textarea`, `Select`, `Modal` (size: sm/md/lg/xl), `Card`/`CardHeader`/`CardTitle`, `Badge` (variants for status), `Tabs`, `WhatsAppLink`, `DateRangePicker`.
- Tailwind palettes: `forest-{50..900}` (primary green), `amber` (warnings/secondary), `emerald` (comp/success/free), `indigo` (target/secondary). Tree house = open-air = no fixed numbers.

### 9.5 Date handling rule of thumb
- **All ISO dates are stored without time** (`YYYY-MM-DD`).
- Always parse with `new Date(s + 'T00:00:00')` to avoid TZ-shift bugs.
- Use `toISODate(d: Date)` for the inverse — never `d.toISOString().slice(0, 10)` directly because it shifts to UTC.

### 9.6 Currency
- Always integers (paisa-rounding done implicitly — values come from form NumberInputs).
- Display via `formatBDT` → `৳1,250`. Negative variant: `formatBDTSigned`.

### 9.7 File uploads (Supabase Storage)
- The browser uploads directly to the bucket via `supabase.storage.from(bucket).upload(path, file)`. Don't proxy through a Next route — it would double the payload.
- After a successful upload, call a server action (e.g. `attachReceipt`) to record metadata. If the metadata insert fails, the action should remove the Storage object (no orphans).
- For private buckets, never embed raw paths in HTML. Mint signed URLs server-side via `supabase.storage.from(bucket).createSignedUrl(path, expirySec)` and pass them to client components. URLs default to a 1-hour TTL — fine for a single page session.
- Validate mime + size client-side AND DB-side (CHECK constraints on `expense_attachments`).
- Path convention: `<YYYY>/<MM>/<entity_id>/<timestamp>-<safe_filename>`. Deterministic prefix lets you eyeball-clean a month's files in the Storage UI.

### 9.8 Audit logging (best-effort)
- `history_log` writes are wrapped in try/catch — never let an audit failure break a user-facing CRUD operation. The `logHistory` helper in `lib/actions/expenses.ts` is the canonical pattern; consider extracting a shared helper if more domains need it.

### 9.9 Migration tolerance
- Pages that depend on tables created by an optional migration should wrap their data fetch in try/catch and render `<MigrationErrorBanner>` (or the equivalent) on failure. Never crash the server component on a missing-table error — the banner tells the user which SQL file to run.

### 9.10 Mobile responsive expectations
- The codebase ships single-tenant on a tablet/phone-first workflow. Standard breakpoints: stack at `< sm` (640px), 2-col at `sm`, full grid at `md` (768px) or `lg` (1024px).
- Tables in admin views (categories / payees / budgets / recurring templates) wrap their `<table>` in `<div className="overflow-x-auto">` with a `min-w-[Npx]` floor on the table. The outer rounded-border wrapper uses `overflow-hidden` for clipping.
- Don't fight the 12-col grid on `< md` — stack the line into space-y-2 vertically and switch to `md:grid md:grid-cols-12` at the breakpoint. See `DailyExpenseGrid` for the canonical pattern (amount + remove share a flex row even on mobile via the `md:contents` trick so they don't waste a row each).
- `DateRangePicker` is responsive: 1 month on mobile, 2 on `sm+`. Trigger labels are short ("11 Apr") on mobile, full ("Saturday, 11 Apr 2026") on `sm+`.

---

## 10. Recently completed (in order, with commit refs)

These are the most recent additions — useful context if planning extends them:

1. **Auth system**: `/login`, `/login/diagnose`, middleware, sign-out flow, server-action sign-in. `@supabase/ssr` bumped to ^0.5.2.
2. **Booking date change** + **room swap** (`confirmDateChange`, `swapRoomAssignment`, `ChangeDatesModal`, `SwapRoomsModal`): three swap modes (reassign / swap-bookings / type-change).
3. **Complimentary rooms — phase 1** (`12c1401`): `compRoomQtys` state, daylong-only, calculator skips `unit_price === 0`, WhatsApp formatter adds `🎁 COMPLIMENTARY ROOMS` section, day-of-week added to `formatDate` globally.
4. **Complimentary rooms — phase 2 + Booking Analytics** (`99c2b4b`):
   - Comp rows gained full assignment parity (room numbers, availability blocking, swap participation, type changes, paid↔comp conversion).
   - `swapRoomAssignment` refactored to target rows by `booking_room_id`.
   - **Booking Analytics module** added — `/analytics` page, `DateRangePicker`, `lib/queries/analytics.ts`, recharts dep.
5. **Expense module — Phase 1** (`9b59b91`, core ledger): 6 tables, seed catalog (14 categories / 5 payees / 3 templates), single + bulk daily entry, category/payee admin pages, dashboard `<ExpensesThisMonth>` card, sidebar link, rose Tailwind palette.
6. **Expense module — Phase 2** (`78c57cc`, reporting + analytics + P&L): `get_expense_daily_pivot` RPC, monthly Excel-style report with print page, expense analytics page (KPIs / charts / P&L), CSV export, dashboard `<MonthlyPnLWidget>`.
7. **Expense module — Phase 3** (`23e1021`, receipts + budgets + recurring): Storage bucket setup, browser uploader + signed-URL viewer, Monthly/Annual budgets with budget-vs-actual progress, recurring templates with idempotent `generateMonthlyDrafts`, draft confirm/discard cards.
8. **Expense bug-fix pass** (`5c6230a`): UUID bug in `generateMonthlyDrafts` history log, ExpenseForm now always shows description+payee with required/optional labels, BudgetManager gained working delete via `budget_id`, `<MigrationErrorBanner>` added so unmigrated pages don't crash.
9. **Migration 000 hardening** (`5aad299`, `f8f8dbd`): `entity_type` is text+CHECK not enum; `history_log` is created if missing; `logHistory` made non-blocking.
10. **Quick-add for custom categories/payees** (`0425e39`): `<QuickAddCategoryModal>` and `<QuickAddPayeeModal>` next to dropdowns in `ExpenseForm` and `DailyExpenseGrid`.
11. **Inline expense edit/delete** (`d1d148b`): `<ExpenseRowActions>` adds pencil + trash to every list row.
12. **Receipt upload during new entry + viewable from list** (`282b771`): pending-receipts queue on `/expenses/new`, `<AttachmentsViewerButton>` modal on the list table.
13. **Mobile responsive pass** (`6c7cd53`): DailyExpenseGrid stacks below md, DateRangePicker 1-month on mobile, admin tables get inner `overflow-x-auto`, ExpenseFilters take full width on mobile.
14. **HR module** (4 phases): full employee lifecycle, salary structures (effective-dated), attendance grid with leave-balance auto-sync, leave types admin, multi-month loans, salary adjustments (fines / bonuses / advances), per-staff service charge, monthly payroll preview + finalize that writes one expense per staff. **Auto-creates `expense_payees` row on employee insert** — the integration spine. Sidebar HR entry, sky accent.
15. **Auth & Roles** (Phase 1+2): `roles`, `modules`, `role_permissions`, `user_profiles` tables. 4 system roles (admin / manager / front_desk / accountant), 7 modules. `lib/auth/permissions.ts` cached helpers. Middleware enforces module-level read at the URL layer. `/settings/users` admin (with one-time temp-password reveal), `/settings/roles/[slug]` permission grid editor with admin-settings-write lock + last-active-admin guard. `/403` page. Sidebar permission-gates every link. Backfill block in migration auto-promotes pre-existing `auth.users` rows to admin.
16. **Front Desk scope tightening**: `availability` module carved out of `bookings`. `front_desk` role demoted: `availability:read + checkout:write`, all else `none`. Sidebar shows only Checkout + Availability for them. Booking detail unreachable; they use `/checkout/[bookingId]` for everything.
17. **Duplicate-booking detection**: `findDuplicateBookings` in `createQuote` and `convertQuoteToBooking`. Soft-warn — actions return `{ success: false, duplicate: { existing: [...] } }` and the form shows `<DuplicateConfirmModal>` with "Create anyway" override. `/settings/duplicate-bookings` audit page lists groups + per-row Cancel.
18. **Checkout module** (Phase 1–4 + multiple iterations): `charge_categories` + `charge_items` (catalog admin at `/settings/charge-catalog`), `checkouts` + `checkout_charges` + `checkout_payments`. Full flow at `/checkout/[bookingId]` — Add Charge modal with 3 tabs (Catalog / Room+Guest upsale / Free-form), Payments form (split-tender), Discount modal, Adjust Guest Count modal, Finalize / Refund / Void / Invoice PDF. PDF rendered via `@react-pdf/renderer` with logo + discount line + math fix that includes `booking.total`.
19. **Net-due math fix**: `lib/checkout/totals.ts::calcNetDue` now correctly treats the advance as paid against the **whole stay** (`booking.total + extra charges − discount − advance − payments`). Earlier behavior incorrectly showed "Refund Due" when guests had advance > extras.
20. **Audit log** (`admin_alerts` table + `/settings/audit-log` + Settings sidebar badge): every discount, guest reduction, void, refund, deactivation flagged via `flagAlert`. Filters by event type. Acknowledge button per row.
21. **Lazy catalog**: `GET /api/checkout/catalog` loaded on first Add-Charge open instead of server-side per render — measurable speedup on the checkout detail page.
22. **Sales rep attribution + team revenue**: `employees` gets `is_sales` + `sales_team`, `quotes` + `bookings` get `sales_employee_id`. QuoteForm has a Sales Rep dropdown; rep is copied from quote → booking on conversion; admin can re-assign via `<SalesRepEditor>` on the booking detail. New `/hr/sales` page with KPIs + per-rep leaderboard + per-team rollup, filtered by date range. Cancelled bookings excluded from revenue (counted separately). Migration: `migrations/hr-module/001_add_sales_attribution.sql`.
23. **Conversion-time over-booking guard** (`7804472`): `convertQuoteToBooking` now re-runs `checkAvailabilityConflict` (with `excludeQuoteId`) and a room-number conflict check via `getBookedRoomNumbers` before insert. Two `sent` quotes for the same rooms can both pass at quote creation but only one converts; the other returns `success: false` with the conflict reason. Sent quotes intentionally do NOT block availability — re-check is the chokepoint.
24. **Duplicate-bookings audit upgraded** (`8130785`): `/settings/duplicate-bookings` now annotates each row with activity (charges / payments / checkout) and creation order, then auto-flags the "likely dupe" — earlier creation with no activity. Operators no longer have to guess which one to cancel.
25. **AddChargeModal — UX polish** (`8c4d66d`, `a45ab93`, `e3c03e5`):
    - Loading + empty states for Free-form / Upsale tabs.
    - Complimentary Rooms section in QuoteForm collapsed by default.
    - Extra-guest unit price now derived via `lib/checkout/extras-pricing.ts::getExtraGuestUnitPrice` — for daylong it pulls the **adult** line item's unit price (the resolved Friday/Holiday/Weekday rate); for night it falls back to `snapshot.extra_person`. Fixes ৳0 per-guest price on daylong checkouts.
26. **Perf — Phase 1: cache reference data** (`026918b`):
    - New `lib/cache.ts::cachedRef` helper — wraps a query in `unstable_cache` and invokes it through `createServiceClient` (the `unstable_cache` callback can't access cookies, so anon-client doesn't work).
    - Wrapped: `getAllSettings`, `getHolidayDates`, `getRoomInventoryConfig` (settings), `getPackages` / `getActivePackages` (packages — detail query stays uncached for fresh pricing at quote creation), `listChargeCategories` / `listChargeItems` (charge catalog), `getAllLeaveTypes` / `getActiveLeaveTypes` (HR), `listRoles` + `listModules` (auth).
    - Mutations call `revalidateTag('<key>')` to bust the right cache key. Stuck "Loading categories…" spinner in `<AddChargeModal>` fixed alongside (root cause: `useEffect` deps included `catalogLoading`, creating a stale-closure cancellation loop).
27. **Perf — Phase 2A+B: collapse permission lookups** (`7cc0351`):
    - Both the middleware route guard and `lib/auth/permissions.ts::getCurrentUserContext` previously did 2 sequential queries (`user_profiles` → `role_permissions`). Now a single nested select pulls profile + role + role_permissions + module slugs in one shot. Saves 1 round-trip per page navigation. The `cache()`-wrapping on `getCurrentUserContext` still ensures one DB hit per request even with multiple callers.
28. **Perf — Phase 2C: trim list payloads** (`971906b`): `getBookings` and `getQuotes` no longer pull `line_items`, `extra_items`, or (for quotes) `package_snapshot` — none are rendered by the list pages or `<BookingTable>`/`<QuoteTable>`. Detail helpers (`getBookingById`, `getQuoteById`) keep `select('*')`.
29. **Perf — Phase 3A: dynamic-import recharts** (`6b74df4`): `<AnalyticsClient>` and `<ExpenseAnalyticsClient>` switched to `next/dynamic` in their pages. Recharts now lives in route-specific async chunks under `/analytics` and `/expenses/analytics`, never shipped on other pages. `ssr: false` is **not** allowed from server components in Next 14 — left SSR on; both components are already `'use client'` so hydration is unaffected.

---

## 11. Open / known limitations to keep in mind

- **No payments ledger.** `bookings.advance_paid` is a single point-in-time number. No history of payment transactions, no separate `payments` table. If a new module needs to track multiple payment events (deposits, partial payments, refunds), this is a gap.
- **No customer table.** Customer info (`customer_name`, `customer_phone`) lives only on quotes and bookings. No way to query "all bookings by customer X" except via `ilike` on phone/name. A customers table + FK is missing.
- **Comp ↔ paid conversion does NOT trigger refund.** Just shows a warning. Manual handling.
- **`history_event` is a Postgres ENUM** but `history_log.entity_type` is **NOT** — it's `text` with a CHECK constraint. Adding event types requires `ALTER TYPE … ADD VALUE`; adding entity types requires drop-and-recreate of the CHECK constraint. The codebase reuses `'edited'` with `payload.action` to avoid both.
- **Cancelled bookings still occupy nothing in availability** (correct behavior) but **are excluded from revenue analytics** (also correct). Same convention is used in expense P&L.
- **`getRoomTypeUtilization` denominator is approximate** — uses `available_inventory × days_in_range`, doesn't subtract daylong-only rooms on night-only days. Acceptable for v1 but easy to over-precision.
- **Tree house occupancy in availability is currently treated like other rooms** — it's flagged `daylong_only`, but the availability checker only filters daylong-only types when `packageType === 'night'`.
- **No background jobs / queues.** All work is request-scoped Server Actions or API Routes. `generateMonthlyDrafts` is operator-triggered from `/expenses/recurring`, not cron. Vercel scheduled functions or pg_cron would be needed for true automation.
- **Recurring templates have no end date.** Set `is_active = false` (Pause) to stop generation. There's no "every other month" or "quarterly" cadence — only `day_of_month` (1–28).
- **Expense receipts use a single private bucket.** No per-organisation isolation since the app is single-tenant. If multi-tenant ever happens, bucket-per-tenant or path-prefix-per-tenant is the migration.
- **`history_log` may not exist on a fresh Supabase project.** Migration 000 creates it if missing. `logHistory` is non-blocking, so a missing table just produces console warnings.
- **Single locale.** All UI is English; only the BDT currency symbol is localized.
- **Single-tenant.** No multi-resort or multi-branch scoping anywhere.

---

## 12. Quick reference: typical "add a new module" checklist

When extending the system, here are the touchpoints to consider:

| Consideration | Where to handle |
|---|---|
| New table | Add to Supabase + add Row interface in `lib/supabase/types.ts` + add to `Database` interface |
| New TS enum | Add as TS union; if it needs to be a Postgres enum, add migration; if a CHECK on text, add migration that drops + recreates the CHECK |
| New query | `lib/queries/<domain>.ts` |
| New mutation | `lib/actions/<domain>.ts` (`'use server'`) — return `ActionResult` / `ActionData`, log to `history_log` (best-effort), `revalidatePath` |
| New form | Zod schema in `lib/validators/`, react-hook-form + zodResolver, `<form action={serverAction}>` or `useTransition` |
| New page | `app/(agent)/<route>/page.tsx` (auth-protected) — wrap data fetch in try/catch + `<MigrationErrorBanner>` if it depends on optional migrations. Use `<Topbar>` + content. Add server-component as default; create a `<Page>Client.tsx` for interactive parts. |
| New API endpoint | `app/api/<route>/route.ts` — exports `GET`/`POST`. Already auth-gated by middleware. |
| New nav link | `components/layout/Sidebar.tsx` `navItems` |
| New chart | Wrap in a `Section` card. Use `<ResponsiveContainer>` from recharts. |
| New WhatsApp section | Edit `lib/formatters/whatsapp.ts::formatWhatsApp`. Add a corresponding field to `WhatsAppParams` if the data isn't already present in the booking. |
| New currency display | `formatBDT(n)` from `lib/formatters/currency.ts` |
| New date display | `formatDate(s)` (Saturday, 11 Apr 2026) or `formatDateRange(from, to)` |
| Cross-cutting setting | `settings` table KV — read via `getSettings()`, edit via `lib/actions/settings.ts` |
| Audit logging | Insert into `history_log` with `event: 'edited'` and a meaningful `payload.action` discriminator. Wrap in try/catch — never let logging block the user op. |
| File uploads | Browser uploads to Supabase Storage; server action records metadata; render via signed URLs from `createSignedUrl`. See `lib/queries/expenses.ts::getSignedAttachmentUrl` and `components/expenses/ReceiptUploader.tsx` for the canonical pattern. |
| Mobile layout | Stack at `< sm` (use `space-y-2` + `md:grid md:grid-cols-N`); wrap tables in `overflow-x-auto` with a `min-w-[Npx]` floor on the table itself. |
| New permission slug | Add to `ModuleSlug` union in `lib/supabase/types.ts`, `ALL_MODULES` in `lib/auth/permissions.ts`, INSERT into `modules` via migration, seed `role_permissions` for each role. Add the URL prefix → ModuleSlug mapping in `middleware.ts`. Permission-gate the page with `await requirePermission('<slug>', 'read')`. Tag the sidebar nav item with `module: '<slug>'`. |
| New protected page | `await requirePermission('<module>', 'read'\|'write')` at the top of the server component. Mutating server actions also call it (or `checkPermission` if you want to return `ActionResult` instead of redirecting). |
| New flagged event | Add to `AdminAlertEvent` union in `lib/supabase/types.ts`, extend the `admin_alerts.event_type` CHECK in a migration, call `flagAlert({...})` from your action. Add filter chip + label/badge map in `components/settings/AuditLogClient.tsx`. |
| New PDF | Use `@react-pdf/renderer` server-side. Stream from an `app/api/.../route.ts` via `renderToBuffer`. Read auxiliary assets (logo, fonts) with `fs.readFileSync` at request time. |

---

## 13. Things that might surprise you

- **`as any` on supabase clients is everywhere.** Don't fight it; the `Database` generic doesn't compose well with the dynamic filter chains we build. Type-safety is enforced at the result-shape level instead.
- **`package_snapshot` is the source of truth for old bookings.** Editing a Package never retroactively changes a booking's pricing.
- **`booking_rooms` can have multiple rows of the same `room_type`** (paid + comp). Always prefer `booking_room_id` over `room_type` when targeting.
- **Comp rooms BLOCK availability.** They occupy real physical rooms.
- **`room_numbers` is `string[]`** even though they look numeric. Treat as opaque IDs.
- **`nights` is NULL for daylong**, computed from dates for night.
- **Login uses a Server Action**, not a client-side `signInWithPassword`, to dodge browser CORS and missing-env-var traps in Vercel.
- **Print/PDF uses two different paths**: quote/booking detail pages use `react-to-print` + `jspdf-autotable`; the analytics + monthly-report pages use native browser print via `@media print`.
- **`getDailyRevenue` and `getDailyExpenseTrend` return continuous days** (zero-filled) so bar charts render smoothly even on quiet weeks.
- **Postgres NUMERIC arrives as a string** from PostgREST. Coerce via `Number(r.amount ?? 0)` everywhere — already done in `lib/queries/expenses.ts` but easy to forget in new queries.
- **`history_log.entity_type` is `text` with a CHECK constraint, not an ENUM.** Adding a new entity type means dropping and recreating the constraint, not `ALTER TYPE … ADD VALUE`. The original migration named `000_extend_entity_type_enum.sql` is misleadingly named — kept for compatibility with the file layout; its actual implementation is text+CHECK.
- **Audit logging is non-blocking** in the expense module (`logHistory` swallows errors). If you copy this pattern to other modules, do the same — better to fail-soft on audit than to block the user from creating an expense.
- **`expenses.is_draft` rows are excluded from every analytics query** — drafts must be confirmed before they count. Never join expenses without `is_draft = false`.
- **Each recurring template fires exactly once per month** via `last_generated_for`. Re-running `generateMonthlyDrafts(month)` after templates already generated is a safe no-op.
- **Storage uploads are a two-step transaction** (Storage upload + DB metadata insert). If the second step fails, the upload action removes the Storage object — otherwise you get orphan blobs.
- **Quick-add for categories/payees** uses local component state to optimistically show the new entry; `router.refresh()` runs in the background to keep the server in sync. Don't replace local state from the refresh — it would jump-cut the user.
- **The DB-generated `checkouts.net_due` column is wrong by design.** It computes `charges_total − advance_amount − payments_total` and ignores `booking.total`. Always use `lib/checkout/totals.ts::calcNetDue` for the user-facing number — that one includes booking total + discount.
- **Creating an employee implicitly creates an `expense_payees` row.** The `expense_payee_id` link is the integration spine — payroll's auto-written salary expenses flow through it. If the payee insert fails, the action rolls back the auth.users row.
- **Salary structures are append-only.** `setSalaryStructure` always closes the current row (`effective_to = new effective_from − 1 day`) before inserting the new one. Never edit a historical structure in place.
- **`history_log.entity_type` now allows 10 values**: `quote | booking | expense | employee | payroll_run | loan | user | role | checkout | charge_item`. Any new entity type requires another DROP/ADD CHECK migration.
- **`bookings.status` was extended to `checked_out`** by `migrations/checkout-module/000_create_checkout_tables.sql`. The migration handles both CHECK and ENUM cases via a DO-block, so it works regardless of how the original schema was created.
- **`createServiceClient` is server-only** and uses `SUPABASE_SERVICE_ROLE_KEY`. It's used by `lib/actions/users.ts` for `auth.admin.*` operations. Never import it from a client component — leaks the service role into the browser bundle.
- **Permission checks are cached per request** via `cache()` on `getCurrentUserContext`. Calling `hasPermission` or `requirePermission` from N components costs one DB roundtrip total, not N.
- **Middleware enforces module-level read** even before the page renders. A direct nav to `/bookings/123` by a `front_desk` user redirects to `/403` without ever invoking the page component. If you add a new route, add the prefix → ModuleSlug mapping to `middleware.ts::MODULE_PREFIX`.
- **Sidebar badges and unread alerts** flow through `app/(agent)/layout.tsx` — it server-fetches `getUnreadAlertCount()` once per request and passes it down to `<Sidebar>`. Don't re-fetch from client components.
- **Discount on checkout uses both `discount_amount` and `discount_pct`.** Percent is converted to fixed at apply time and saved on both columns; the percent is only kept for display. The math always uses `discount_amount`.
- **Guest reduction (`actual_adults`/`actual_children` on checkouts) is audit-only.** It does NOT change the bill. To refund the guest for fewer attendees, the operator applies a manual discount.
- **`flagAlert` is best-effort, like `logHistory`** — never let an alert insert failure block the user-facing operation. Mirror this pattern when adding new alert types.
- **The PDF invoice loads `public/logo.png` at request time** via `fs.readFileSync`. If missing, falls back to text-only header. Drop a PNG/JPEG in `public/` to brand it.
- **`bookings.sales_employee_id` is NULL on legacy bookings** — anything created before migration `hr-module/001_add_sales_attribution.sql` was applied. `/hr/sales` shows the unattributed revenue total at the bottom for context. Admin can backfill by editing each booking's sales rep on the booking detail page.
- **`cachedRef` runs through `createServiceClient`, not the user's cookie session.** `unstable_cache`'s callback can't access cookies/headers, so anon-client calls inside it would fail in production. This is why `lib/cache.ts` always uses the service role. Only wrap genuinely shared reference data (settings, packages, catalog) — never per-user data.
- **List queries deliberately differ from detail queries** for `bookings` and `quotes`. List helpers select an explicit column set (no jsonb); detail helpers use `select('*')`. The `BOOKING_LIST_COLUMNS` / `QUOTE_LIST_COLUMNS` constants live at the top of `lib/queries/bookings.ts` and `lib/queries/quotes.ts` — extend them carefully, and keep `BookingWithRooms[]` / `QuoteRow[]` as the return type via an `as unknown as` cast.
- **`next/dynamic` with `ssr: false` is not usable from a server-component page in Next 14.** If a heavy client component is imported in a server-component page, dynamic-import without `ssr: false` is the only option — chunk-splitting still works, only the initial server render is unchanged. Wrap in a tiny `'use client'` shim if you truly need to skip SSR.
- **Sent quotes do NOT block availability**, but **conversion does re-check**. The room-locking semantics are: `confirmed` quotes lock, `sent`/`draft` quotes don't, and `convertQuoteToBooking` re-runs the capacity + room-number checks at insert time with `excludeQuoteId` so the converting quote isn't counted against itself.

---

## 14. Vendor & runtime versions

```json
"dependencies": {
  "next": "^14.2.0",
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "@supabase/supabase-js": "^2.47.0",
  "@supabase/ssr": "^0.5.2",
  "react-hook-form": "^7.51.0",
  "@hookform/resolvers": "^3.3.4",
  "zod": "^3.22.4",
  "date-fns": "^3.6.0",
  "lucide-react": "^0.344.0",
  "react-day-picker": "^8.10.1",
  "jspdf": "^2.5.1",
  "jspdf-autotable": "^3.8.2",
  "react-to-print": "^2.15.1",
  "clsx": "^2.1.0",
  "tailwind-merge": "^2.2.2",
  "recharts": "^2.13.0",
  "@react-pdf/renderer": "^4.5.1"
}
```

Node 18+, deployed on Vercel.

### Required env vars (cumulative)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...    # or legacy eyJ... JWT
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...             # used by lib/supabase/server.ts::createServiceClient
                                                    # for auth.admin.createUser / updateUserById /
                                                    # ban-duration. Server-only — never shipped to browser.
```

---

**End of architecture doc.** Feed this into a new chat along with your new module description and the assistant will have full context for planning.
