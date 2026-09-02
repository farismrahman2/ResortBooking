import { isMissingRelation } from './errors'

/**
 * Run a select that embeds a table which may not exist yet, and re-run it
 * without the embed if PostgREST cannot find the relationship.
 *
 * Code deploys the moment it lands on main; a migration runs when someone
 * pastes it into Supabase. In between, a select that embeds
 * `booking_days(...)` is a 400 from PostgREST — and that select sits under
 * the dashboard, the daily report and the kitchen's cover counts. Falling
 * back to the plain select keeps every one of those pages up, minus only the
 * group itineraries that cannot exist until the table does.
 */
export async function selectWithOptionalEmbed<T>(
  build: (select: string) => PromiseLike<{ data: T | null; error: unknown }>,
  withEmbed: string,
  withoutEmbed: string,
): Promise<{ data: T | null; error: unknown }> {
  const first = await build(withEmbed)
  if (!first.error || !isMissingRelation(first.error)) return first
  return build(withoutEmbed)
}
