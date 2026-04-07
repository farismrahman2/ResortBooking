// ─── Enums ────────────────────────────────────────────────────────────────────

export type PackageType = 'daylong' | 'night'
export type BookingStatus = 'draft' | 'sent' | 'confirmed' | 'cancelled'
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
  entity_type: 'quote' | 'booking'
  entity_id: string
  event: HistoryEvent
  actor: string
  payload: Record<string, unknown> | null
  created_at: string
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
