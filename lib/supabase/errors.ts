/**
 * "Does this error mean the table/column simply isn't there yet?"
 *
 * There are TWO different vocabularies for the same condition and code that
 * checked only one has 500'd a page in production:
 *
 *   Postgres  — SQLSTATE 42P01, 'relation "x" does not exist'
 *   PostgREST — PGRST205 / PGRST204, "Could not find the table 'public.x' in
 *               the schema cache" (also raised for a few seconds after a table
 *               is created, before the schema cache reloads)
 *
 * A feature guarded by "run the migration and this lights up" must recognise
 * both, or the guard is decorative.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isMissingRelation(error: any): boolean {
  if (!error) return false
  const code = String(error.code ?? '')
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST204' || code === 'PGRST202') return true
  const msg = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`
  return /does not exist|could not find the (table|column|function)|schema cache/i.test(msg)
}
