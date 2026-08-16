import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Merge Tailwind classes safely (handles conflicts).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Generate a quote number in the format GCR-YYYY-XXXX.
 * Reads the highest existing quote number for the current year and increments.
 */
export async function generateQuoteNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<string> {
  const year = new Date().getFullYear()
  const { data } = await supabase
    .from('quotes')
    .select('quote_number')
    .like('quote_number', `GCR-${year}-%`)
    .order('quote_number', { ascending: false })
    .limit(1)

  const lastNum = data?.[0]?.quote_number?.split('-').pop() ?? '0000'
  const next = String(Number(lastNum) + 1).padStart(4, '0')
  return `GCR-${year}-${next}`
}

/**
 * Generate a booking number in the format GCR-B-YYYY-XXXX.
 */
export async function generateBookingNumber(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
): Promise<string> {
  const year = new Date().getFullYear()
  const { data } = await supabase
    .from('bookings')
    .select('booking_number')
    .like('booking_number', `GCR-B-${year}-%`)
    .order('booking_number', { ascending: false })
    .limit(1)

  const lastNum = data?.[0]?.booking_number?.split('-').pop() ?? '0000'
  const next = String(Number(lastNum) + 1).padStart(4, '0')
  return `GCR-B-${year}-${next}`
}

/**
 * Postgres unique-constraint violation (SQLSTATE 23505). Business numbers
 * (GCR-…, GCR-B-…) are allocated by reading MAX+1 and inserting — two
 * concurrent conversions can pick the same number, and the unique index
 * (migrations/platform-audit) turns the loser into this error. Callers
 * detect it and retry with a freshly generated number.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isUniqueViolation(error: any, needle?: string): boolean {
  if (!error || error.code !== '23505') return false
  return !needle || String(error.message ?? '').includes(needle) || String(error.details ?? '').includes(needle)
}

/**
 * Make user-typed search text safe inside a PostgREST `.or()` ilike filter.
 *
 * Commas and parentheses are the .or() list syntax — a search for
 * "chicken, beef (frozen)" used to make PostgREST reject the whole filter and
 * the page threw instead of returning no rows. Wildcards are stripped too so
 * "%" in a query can't turn into match-everything.
 */
export function sanitizeSearch(input: string): string {
  return input.replace(/[,()\\%_]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Truncate a string to maxLen characters with ellipsis.
 */
export function truncate(str: string, maxLen = 50): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str
}

/**
 * Sleep helper for development/debugging
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Check if we're in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

/**
 * Safely parse a JSON value, returning a fallback on error
 */
export function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
