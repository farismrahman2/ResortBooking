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
