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
