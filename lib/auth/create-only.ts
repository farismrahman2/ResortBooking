/**
 * "Create-only" booking access — Corporate Sales.
 *
 * They hold bookings: write so they can make quotes and turn them into
 * bookings, but they must never see the bookings/quotes lists, anyone else's
 * booking, or change a booking once it exists. These rules live here so every
 * page, action, PDF and API route asks the same question.
 *
 * The database enforces the same thing (migrations/security/004_*): their
 * rows are only the ones they created.
 */

export const CREATE_ONLY_ROLES: readonly string[] = ['corporate_sales']

export const isCreateOnlyRole = (roleSlug: string | null | undefined) =>
  !!roleSlug && CREATE_ONLY_ROLES.includes(roleSlug)

/** May this viewer open a quote/booking with this creator? */
export function canSeeRecord(
  viewer: { user_id: string; roleSlug: string | null | undefined },
  createdBy: string | null | undefined,
): boolean {
  if (!isCreateOnlyRole(viewer.roleSlug)) return true
  return !!createdBy && createdBy === viewer.user_id
}

/** Shown when a create-only user reaches something they can't use. */
export const CREATE_ONLY_MESSAGE = 'Corporate Sales can create bookings only — ask Reservations to change or cancel one.'

/**
 * Duplicate-guest warnings name the other booking and its total. A create-only
 * user still gets warned, but sees only the date and type.
 */
export function maskDuplicates<T extends { id: string; number: string; customer_name: string; customer_phone: string; total: number }>(
  rows: T[], roleSlug: string | null | undefined,
): T[] {
  if (!isCreateOnlyRole(roleSlug)) return rows
  return rows.map((r) => ({ ...r, id: '', number: '—', customer_name: '', customer_phone: '', total: 0 }))
}

/** What a booking already charges — the fields a create-only edit may not change. */
export interface StoredBookingMoney {
  subtotal: number
  discount: number            // stored total discount (flat + % amount)
  discount_pct: number | null
  service_charge_pct: number | null
  vat_pct: number | null
  advance_paid: number
  advance_required: number
  extra_items: Array<{ label: string; qty: number; unit_price: number }> | null
  package_type: string
  visit_date: string
  check_out_date: string | null
  package_snapshot: unknown
  rooms: Array<{ room_type: string; unit_price: number; qty?: number; room_numbers?: string[] | null; evening_rooms?: string[] | null }>
}

interface EditInput {
  discount: number; discount_pct: number; service_charge_pct: number; vat_pct: number
  advance_paid: number; advance_required: number
  rooms: Array<{ room_type: string; unit_price: number; qty: number; display_name?: string; room_numbers: string[]; evening_rooms?: string[] }>
  extra_items: Array<{ label: string; qty: number; unit_price: number }>
  package_type: string; visit_date: string; check_out_date: string | null; package_snapshot: unknown
}

/**
 * A Corporate Sales edit keeps every money term of the booking as it is:
 * discount, service charge, VAT, advance, extra charges, room rates, package
 * and dates (dates change through the date-change step). Guest details,
 * headcount and room choice come from the edit; totals then follow the
 * package's own rates. A room type new to the booking is priced at the
 * package's rate for it. Complimentary (free) rooms stay exactly as stored —
 * an edit can neither add nor remove one.
 */
export function lockMoneyFields<T extends EditInput>(input: T, stored: StoredBookingMoney): T {
  const pct = Number(stored.discount_pct ?? 0)
  const flat = Math.max(0, Number(stored.discount) - Math.round(Number(stored.subtotal) * pct / 100))
  const snapPrices = ((stored.package_snapshot as { room_prices?: Record<string, number> } | null)?.room_prices) ?? {}
  // A zero-price row is "complimentary" only where the package charges for
  // that room type; where the package itself prices it at 0, it's an ordinary row.
  const isComp = (r: { room_type: string; unit_price: number }) =>
    Number(r.unit_price) <= 0 && Number(snapPrices[r.room_type] ?? 0) > 0
  const paidStored = stored.rooms.filter((r) => !isComp(r))
  const compStored = stored.rooms.filter(isComp)
  const rateOf = (type: string) => {
    const kept = paidStored.find((r) => r.room_type === type)
    return kept ? Number(kept.unit_price) : Number(snapPrices[type] ?? 0)
  }
  type Room = T['rooms'][number]
  return {
    ...input,
    discount: flat,
    discount_pct: pct,
    service_charge_pct: Number(stored.service_charge_pct ?? 0),
    vat_pct: Number(stored.vat_pct ?? 0),
    advance_paid: Number(stored.advance_paid),
    advance_required: Number(stored.advance_required),
    extra_items: (stored.extra_items ?? []).map((e) => ({ ...e })),
    package_type: stored.package_type,
    visit_date: stored.visit_date,
    check_out_date: stored.check_out_date,
    package_snapshot: stored.package_snapshot,
    rooms: [
      ...input.rooms.filter((r) => !isComp(r)).map((r) => ({ ...r, unit_price: rateOf(r.room_type) })),
      ...compStored.map((r) => ({
        room_type: r.room_type, display_name: r.room_type.replace(/_/g, ' '), qty: Number(r.qty ?? 0), unit_price: 0,
        room_numbers: r.room_numbers ?? [], evening_rooms: r.evening_rooms ?? [],
      }) as unknown as Room),
    ],
  }
}
