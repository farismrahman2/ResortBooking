# Garden Centre Resort — Booking Agent: System & Technical Architecture

**Purpose of this document:** complete context for planning new modules on top of the existing application. Paste this whole file into a fresh Claude AI chat, then describe the new module you want — the assistant will have everything it needs to plan around the existing system.

---

## 1. Product overview

**App name:** Garden Centre Resort — Auto Quotation & Booking Agent
**Repo:** `resort-agent` (Next.js 14 App Router)
**Users:** Internal resort staff (single-tenant). Admin creates user accounts via Supabase Dashboard; no self-signup. All routes are auth-protected.
**Currency:** BDT (Bangladeshi Taka, ৳).

The app handles the resort's quotation and booking lifecycle:
- Staff create a **quote** for a customer (selects package, date(s), guests, rooms, extras → live pricing preview → generates a copy-paste WhatsApp message).
- Confirmed quotes are converted to **bookings**, which track payment status, room number assignments, and a frozen pricing snapshot.
- Supporting features: package management, room availability calendar, holiday calendar, settings, daily kitchen/housekeeping reports, **revenue/analytics dashboard**.

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
| UI | React 18, Tailwind CSS 3 (with custom `forest`, `amber`, `emerald`, `indigo` accent palettes) |
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
type BookingStatus = 'draft' | 'sent' | 'confirmed' | 'cancelled'
type HistoryEvent  = 'created' | 'edited' | 'status_changed' | 'converted_to_booking'
type RoomType      = 'cottage' | 'eco_deluxe' | 'deluxe' | 'premium_deluxe'
                   | 'premium' | 'super_premium' | 'tree_house'
```

> **Important:**
> - `history_event` is a Postgres ENUM. Adding new values requires a migration (`ALTER TYPE … ADD VALUE`). We've avoided that by reusing `'edited'` with a descriptive `payload.action` field (e.g. `payload.action = 'dates_changed' | 'rooms_swapped'`).
> - `history_log.entity_type` is **NOT** an enum — it's a TEXT column guarded by a CHECK constraint. To allow a new value (e.g. `'expense'`), drop and recreate the CHECK constraint with the new value included. See `migrations/expense-module/000_extend_entity_type_enum.sql` for the canonical pattern.

### Tables

| Table | Key columns | Notes |
|---|---|---|
| **room_inventory** | `room_type` (PK), `display_name`, `total_units`, `daylong_only` (bool), `display_order` | Fixed inventory: how many units of each type exist. Tree house is `daylong_only`. |
| **packages** | `id`, `name`, `type`, `is_active`, `display_order`, validity (`all_year`/`valid_from`/`valid_to`/`specific_dates[]`/`is_override`), pricing (`weekday_adult`/`friday_adult`/`holiday_adult`/`child_meal`/`driver_price`/`extra_person`/`extra_bed`), timing (`check_in`/`check_out`), meal flags (`includes_breakfast` etc.), text blocks (`title`/`intro`/`meals`/`activities`/`experience`/`why_choose_us`/`cta`/`notes`) | Override packages take priority over regular packages on overlapping dates. See `lib/engine/package-resolver.ts`. |
| **package_room_prices** | `id`, `package_id`, `room_type`, `price` | Per-package, per-room-type pricing. |
| **settings** | `key`, `value` (text-only KV). Common keys: `payment_instructions`, `contact_numbers`, `whatsapp_footer_text`. |
| **holiday_dates** | `id`, `date` (ISO), `label` | Used by calculator to apply holiday rate. |
| **quotes** | `id`, `quote_number`, customer info, `package_type`, `visit_date`, `check_out_date` (nullable for daylong), `nights` (generated), guests, pricing (`subtotal`/`discount`/`discount_pct`/`service_charge_pct`/`total` (gen)/`advance_required`/`advance_paid`/`due_advance` (gen)/`remaining` (gen)), `status` (BookingStatus), `converted_to_booking_id`, `package_snapshot` (JSONB), `line_items[]` (JSONB), `extra_items[]` (JSONB) | `total`, `due_advance`, `remaining`, `nights` are DB-generated columns. |
| **quote_rooms** | `id`, `quote_id`, `room_type`, `qty`, `unit_price`, `room_numbers[]` | One row per (quote, room_type, charge_mode). **Two rows of the same room_type can coexist** — one paid (`unit_price > 0`) and one complimentary (`unit_price === 0`). |
| **bookings** | Mirror of `quotes` minus `quote_number → booking_number` and adds optional `quote_id` link. Same generated columns. | `package_snapshot` is **frozen** at booking creation; subsequent edits to the originating package don't affect the booking. |
| **booking_rooms** | `id`, `booking_id`, `room_type`, `qty`, `unit_price`, `room_numbers[]` | Same multi-row-per-type semantics as `quote_rooms`. The `id` is now the canonical row identifier used by the `swapRoomAssignment` server action. |
| **history_log** | `id`, `entity_type` ('quote'\|'booking'), `entity_id`, `event` (HistoryEvent), `actor`, `payload` (JSONB), `created_at` | Audit trail. Only INSERTs, never updates. |

### Database functions
- `get_availability_range(p_from, p_to)` — RPC returning `{ check_date, check_room_type, qty_booked }[]` for fast calendar rendering.

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
    analytics/page.tsx      # NEW — revenue/analytics
    settings/page.tsx
    layout.tsx              # Auth check → fetches user, renders LayoutShell
  api/                      # Public API routes (no auth check; middleware handles it)
    availability/route.ts
    booked-room-numbers/route.ts
    daily-report/route.ts
    date-change-preview/route.ts
    overlapping-bookings/route.ts
    revenue/route.ts         # used by RevenueWidget
    room-noon-notice/route.ts
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
  dashboard/QuickActions.tsx, RecentQuotes.tsx, RevenueWidget.tsx, StatsCards.tsx
  layout/LayoutShell.tsx, Sidebar.tsx, Topbar.tsx
  packages/PackageForm.tsx, PackageTable.tsx, RoomPriceEditor.tsx, TextBlockEditor.tsx
  print/PrintLayout.tsx
  quotes/CopyButton.tsx, GuestInputs.tsx, PackageSelector.tsx, PricingBreakdown.tsx,
         QuoteActions.tsx, QuoteForm.tsx, QuoteTable.tsx, RoomSelector.tsx, WhatsAppOutput.tsx
  settings/HolidayManager.tsx, SettingsForm.tsx
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
    types.ts                # ActionResult, ActionData
  config/rooms.ts           # ROOM_NUMBERS map + nextDay + dateRangesOverlap helpers
  engine/                   # Pure functions (no DB calls)
    availability.ts         # checkRoomAvailability(inventory, occupied, packageType?)
    calculator.ts           # calculateDaylong, calculateNight, recalculate
    meals.ts                # Daily meal counts for kitchen reports
    package-resolver.ts     # resolvePackage(date, type, packages)
    snapshot.ts             # buildPackageSnapshot, snapshotToRates
  formatters/
    currency.ts             # formatBDT, formatBDTSigned, parseBDT
    dates.ts                # formatDate ('Saturday, 11 Apr 2026'), formatDateRange,
                            # formatDateShort, toISODate, isFriday, isHoliday,
                            # getDayType, computeNights
    phone.ts                # WhatsApp phone formatting
    whatsapp.ts             # formatWhatsApp(WhatsAppParams) — quote + booking confirmation text
  queries/                  # DB read functions (server-only)
    analytics.ts            # NEW — getTotalsSummary, getDailyRevenue,
                            # getPackageTypeBreakdown, getRoomTypeUtilization
    availability.ts         # checkAvailabilityConflict, getRoomAvailability,
                            # getAvailabilityRange, getBookedRoomNumbers
    bookings.ts             # getBookings, getBookingById, getUpcomingBookings,
                            # getBookingStats, getRevenueStats
    daily-report.ts         # Per-date kitchen / housekeeping breakdown
    packages.ts             # getPackages, getPackageById, getActivePackages
    quotes.ts               # getQuotes, getQuoteById, getRecentQuotes, getQuoteStatusCounts
    settings.ts             # getSettings, getHolidayDates, getHolidayDateStrings,
                            # getRoomInventory
  sidebar-context.tsx       # Mobile drawer open/close context
  supabase/
    client.ts               # Browser-side Supabase client
    middleware.ts           # createMiddlewareClient — used in middleware.ts
    server.ts               # createClient() — for server components / actions
    types.ts                # ALL TS types (single source of truth, no separate db.ts)
  utils.ts                  # cn (tailwind-merge), generateQuoteNumber, generateBookingNumber
  validators/
    booking.ts, package.ts, quote.ts   # Zod schemas matching the form inputs

middleware.ts               # Route guard: refreshes session, redirects unauth → /login,
                            # returns 401 JSON for /api/* unauth, redirects auth users away
                            # from /login to /. Allows /login/* and /auth/* through.
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
- KV settings (payment instructions, contact numbers, WhatsApp footer text).
- Holiday date manager.

### 8.7 Analytics (`/analytics` — newest)
- Server component with URL state (`?from=&to=`), default = current month.
- Client (`AnalyticsClient.tsx`): `DateRangePicker` with presets (This month / Last month / This quarter / This year), 4 KPI cards, 3 chart sections:
  - **Daily revenue trend** — `recharts BarChart` (total / collected / outstanding stacked bars).
  - **Package type breakdown** — donut + comparison table (Daylong vs Night).
  - **Room type utilization** — horizontal bar chart + detail table (qty, room-nights, comp count, paid revenue, utilization %).
- Excludes cancelled bookings. Attributes revenue to `visit_date` (not `created_at`).
- "Print / Save as PDF" button uses browser native printing (`@media print` styles strip the picker and break sections cleanly).

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

---

## 10. Recently completed (in order, with commit refs)

These are the most recent additions — useful context if planning extends them:

1. **Auth system** (commits before 12c1401): `/login`, `/login/diagnose`, middleware, sign-out flow, server action sign-in. `@supabase/ssr` bumped to ^0.5.2.
2. **Booking date change** + **room swap** (`confirmDateChange`, `swapRoomAssignment`, `ChangeDatesModal`, `SwapRoomsModal`): three swap modes (reassign / swap-bookings / type-change). Initially keyed by `room_type`.
3. **Complimentary rooms — phase 1** (commit 12c1401): added `compRoomQtys` state, daylong-only, calculator skips `unit_price === 0`, WhatsApp formatter adds `🎁 COMPLIMENTARY ROOMS` section, day-of-week added to `formatDate` globally.
4. **Complimentary rooms — phase 2 + Analytics** (commit 99c2b4b — current HEAD):
   - Comp rows now have full assignment parity: room numbers, availability blocking, swap participation, type changes, paid↔comp conversion.
   - `swapRoomAssignment` refactored to target rows by `booking_room_id` (since paid + comp can share `room_type`). Added `to_charge_mode: 'paid' | 'comp'` to type_change mode.
   - SwapRoomsModal rewritten — per-row selection across all 3 tabs with Paid/🎁 Comp badges.
   - **Analytics module** added — `/analytics` page, `DateRangePicker`, `lib/queries/analytics.ts` (4 queries), recharts dep.
   - Sidebar gained an "Analytics" link.

---

## 11. Open / known limitations to keep in mind

- **No payments ledger.** `bookings.advance_paid` is a single point-in-time number. No history of payment transactions, no separate `payments` table. If a new module needs to track multiple payment events (deposits, partial payments, refunds), this is a gap.
- **No customer table.** Customer info (`customer_name`, `customer_phone`) lives only on quotes and bookings. No way to query "all bookings by customer X" except via `ilike` on phone/name. A customers table + FK is missing.
- **Comp ↔ paid conversion does NOT trigger refund.** Just shows a warning. Manual handling.
- **`history_event` is a Postgres ENUM.** Adding new event types requires a migration. Workaround: reuse `'edited'` with `payload.action`.
- **Cancelled bookings still occupy nothing in availability** (correct behavior) but **are excluded from revenue analytics** (also correct). Make sure new modules align with this convention.
- **`getRoomTypeUtilization` denominator is approximate** — uses `available_inventory × days_in_range`, doesn't subtract daylong-only rooms on night-only days, etc. Acceptable for v1 but easy to over-precision.
- **Tree house occupancy in availability is currently treated like other rooms** — it's flagged `daylong_only`, but the availability checker only filters daylong-only types when `packageType === 'night'`.
- **No background jobs / queues.** All work is request-scoped Server Actions or API Routes. If a new module needs scheduled tasks (reminder emails, daily summaries), there's no infrastructure for that yet.
- **Single locale.** All UI is English; only the BDT currency symbol is localized.
- **Single-tenant.** No multi-resort or multi-branch scoping anywhere.

---

## 12. Quick reference: typical "add a new module" checklist

When extending the system, here are the touchpoints to consider:

| Consideration | Where to handle |
|---|---|
| New table | Add to Supabase + add Row interface in `lib/supabase/types.ts` + add to `Database` interface |
| New TS enum | Add as TS union; if it needs to be a Postgres enum, add migration |
| New query | `lib/queries/<domain>.ts` |
| New mutation | `lib/actions/<domain>.ts` (`'use server'`) — return `ActionResult` / `ActionData`, log to `history_log`, `revalidatePath` |
| New form | Zod schema in `lib/validators/`, react-hook-form + zodResolver, `<form action={serverAction}>` or `useTransition` |
| New page | `app/(agent)/<route>/page.tsx` (auth-protected) — use `<Topbar>` + content. Add server-component as default; create a `<Page>Client.tsx` for interactive parts. |
| New API endpoint | `app/api/<route>/route.ts` — exports `GET`/`POST`. Already auth-gated by middleware. |
| New nav link | `components/layout/Sidebar.tsx` `navItems` |
| New chart | Wrap in a `Section` card. Use `<ResponsiveContainer>` from recharts. |
| New WhatsApp section | Edit `lib/formatters/whatsapp.ts::formatWhatsApp`. Add a corresponding field to `WhatsAppParams` if the data isn't already present in the booking. |
| New currency display | `formatBDT(n)` from `lib/formatters/currency.ts` |
| New date display | `formatDate(s)` (Saturday, 11 Apr 2026) or `formatDateRange(from, to)` |
| Cross-cutting setting | `settings` table KV — read via `getSettings()`, edit via `lib/actions/settings.ts` |
| Audit logging | Insert into `history_log` with `event: 'edited'` and a meaningful `payload.action` |

---

## 13. Things that might surprise you

- **`as any` on supabase clients is everywhere.** Don't fight it; the `Database` generic doesn't compose well with the dynamic filter chains we build. Type-safety is enforced at the result-shape level instead.
- **`package_snapshot` is the source of truth for old bookings.** Editing a Package never retroactively changes a booking's pricing.
- **`booking_rooms` can have multiple rows of the same `room_type`** (paid + comp). Always prefer `booking_room_id` over `room_type` when targeting.
- **Comp rooms BLOCK availability.** They occupy real physical rooms.
- **`room_numbers` is `string[]`** even though they look numeric. Treat as opaque IDs.
- **`nights` is NULL for daylong**, computed from dates for night.
- **Login uses a Server Action**, not a client-side `signInWithPassword`, to dodge browser CORS and missing-env-var traps in Vercel.
- **Print/PDF** uses two different paths: quote/booking detail pages use `react-to-print` + `jspdf-autotable`; the analytics page uses native browser print via `@media print`.
- **`getDailyRevenue` returns continuous days** (zero-filled) so charts render smoothly.

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
  "recharts": "^2.13.0"
}
```

Node 18+, deployed on Vercel.

---

**End of architecture doc.** Feed this into a new chat along with your new module description and the assistant will have full context for planning.
