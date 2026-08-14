import { createClient } from '@/lib/supabase/server'
import type { KitchenDoc } from '@/components/kitchen/DocumentCapture'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createClient() as any

const BUCKET = 'kitchen-docs'

/**
 * Photos attached to a requisition, delivery or payment, each with a
 * short-lived signed URL.
 *
 * The bucket is private, so a stored path is not viewable on its own. URLs are
 * minted per render and expire in an hour — long enough to look at a receipt
 * and argue about it, short enough that a link pasted into a chat stops
 * working.
 *
 * Returns [] rather than throwing when the table is missing, so a page whose
 * migration hasn't been run yet loses its photo strip instead of its content.
 */
export async function listKitchenDocuments(
  entityType: 'requisition' | 'delivery' | 'payment',
  entityId: string,
): Promise<KitchenDoc[]> {
  const { data, error } = await db()
    .from('kitchen_documents')
    .select('id, file_name, kind, caption, storage_path')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at')
  if (error) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []) as any[]
  if (rows.length === 0) return []

  // One round trip for the whole strip rather than one per photo.
  const { data: signed } = await db().storage
    .from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), 3600)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const urlByPath = new Map(((signed ?? []) as any[]).map((s) => [s.path, s.signedUrl ?? null]))

  return rows.map((r) => ({
    id: r.id, file_name: r.file_name, kind: r.kind, caption: r.caption ?? null,
    url: urlByPath.get(r.storage_path) ?? null,
  }))
}

/** Photo counts for a set of entities — for list badges. */
export async function countKitchenDocuments(
  entityType: 'requisition' | 'delivery' | 'payment',
  entityIds: string[],
): Promise<Record<string, number>> {
  if (entityIds.length === 0) return {}
  const { data, error } = await db()
    .from('kitchen_documents')
    .select('entity_id')
    .eq('entity_type', entityType)
    .in('entity_id', entityIds)
  if (error) return {}
  const counts: Record<string, number> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of ((data ?? []) as any[])) counts[d.entity_id] = (counts[d.entity_id] ?? 0) + 1
  return counts
}
