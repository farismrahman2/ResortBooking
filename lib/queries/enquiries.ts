import { createClient } from '@/lib/supabase/server'
import type { EnquiryRow, EnquiryStatus } from '@/lib/supabase/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

export type EnquiryFilter = EnquiryStatus | 'all'

/** List enquiries, newest first, optionally filtered by status. */
export async function listEnquiries(filter: EnquiryFilter = 'new'): Promise<EnquiryRow[]> {
  let query = dbc()
    .from('enquiries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (filter !== 'all') query = query.eq('status', filter)

  const { data, error } = await query
  if (error) throw new Error(`listEnquiries: ${error.message}`)
  return (data ?? []) as EnquiryRow[]
}

/** A single enquiry, or null if it doesn't exist. */
export async function getEnquiry(id: string): Promise<EnquiryRow | null> {
  const { data, error } = await dbc()
    .from('enquiries')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getEnquiry: ${error.message}`)
  return (data as EnquiryRow | null) ?? null
}

export interface EnquiryCounts {
  new: number
  contacted: number
  won: number
  lost: number
  all: number
  /** Unseen leads — drives the sidebar "new enquiries" badge. */
  unseen: number
}

/** Per-status counts for the filter tabs plus the unseen-badge count. */
export async function getEnquiryCounts(): Promise<EnquiryCounts> {
  const db = dbc()
  const head = (build: (q: any) => any) => // eslint-disable-line @typescript-eslint/no-explicit-any
    build(db.from('enquiries').select('id', { count: 'exact', head: true }))

  const [all, byNew, contacted, won, lost, unseen] = await Promise.all([
    head((q: any) => q),                                  // eslint-disable-line @typescript-eslint/no-explicit-any
    head((q: any) => q.eq('status', 'new')),              // eslint-disable-line @typescript-eslint/no-explicit-any
    head((q: any) => q.eq('status', 'contacted')),        // eslint-disable-line @typescript-eslint/no-explicit-any
    head((q: any) => q.eq('status', 'won')),              // eslint-disable-line @typescript-eslint/no-explicit-any
    head((q: any) => q.eq('status', 'lost')),             // eslint-disable-line @typescript-eslint/no-explicit-any
    head((q: any) => q.is('seen_at', null)),              // eslint-disable-line @typescript-eslint/no-explicit-any
  ])

  return {
    all:       all.count ?? 0,
    new:       byNew.count ?? 0,
    contacted: contacted.count ?? 0,
    won:       won.count ?? 0,
    lost:      lost.count ?? 0,
    unseen:    unseen.count ?? 0,
  }
}

/**
 * Count of unseen enquiries. Used by the sidebar badge. Best-effort — a
 * missing table (unmigrated install) resolves to 0 rather than throwing so
 * the whole back-office still renders.
 */
export async function getUnseenEnquiryCount(): Promise<number> {
  try {
    const { count } = await dbc()
      .from('enquiries')
      .select('id', { count: 'exact', head: true })
      .is('seen_at', null)
    return count ?? 0
  } catch {
    return 0
  }
}
