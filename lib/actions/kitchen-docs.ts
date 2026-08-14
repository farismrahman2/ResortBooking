'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import {
  KITCHEN_DOCS_BUCKET, documentPathPrefix,
  type KitchenDocEntity, type KitchenDocKind,
} from '@/lib/kitchen/documents'
import type { ActionResult, ActionData } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbc = () => createClient() as any

/**
 * Record a photo after the client has uploaded it to storage.
 *
 * Split the way the field-visits module does it: the browser uploads straight
 * to Supabase Storage (a 4 MB photo through a server action is slow and hits
 * body limits), then this writes the metadata row. The caller deletes the
 * object if this fails, so a failed insert can't leave an object nobody knows
 * about in a private bucket.
 */
export async function attachKitchenDocument(input: {
  entity_type:  KitchenDocEntity
  entity_id:    string
  storage_path: string
  file_name:    string
  mime_type?:   string | null
  size_bytes?:  number | null
  kind?:        KitchenDocKind
  caption?:     string | null
}): Promise<ActionData<{ id: string }>> {
  await requirePermission('kitchen', 'write')
  try {
    // The path is generated client-side; make sure it lands under the entity
    // it claims, so one entity's upload can't be filed against another.
    if (!input.storage_path.startsWith(documentPathPrefix(input.entity_type, input.entity_id) + '/')) {
      return { success: false, error: 'Upload path does not match this record' }
    }
    const ctx = await getCurrentUserContext()
    const { data, error } = await dbc().from('kitchen_documents').insert({
      entity_type:  input.entity_type,
      entity_id:    input.entity_id,
      kind:         input.kind ?? 'photo',
      storage_path: input.storage_path,
      file_name:    input.file_name,
      mime_type:    input.mime_type ?? null,
      size_bytes:   input.size_bytes ?? null,
      caption:      input.caption ?? null,
      uploaded_by:  ctx?.user_id ?? null,
    }).select('id').single()
    if (error) return { success: false, error: error.message }

    revalidatePath(`/kitchen/${input.entity_type}s/${input.entity_id}`)
    return { success: true, data }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Delete a photo, object first.
 *
 * If the object delete fails we stop rather than dropping the row: a row with
 * no object shows a broken thumbnail, but an object with no row is invisible
 * and permanent — nothing left in the app knows the path to remove it by.
 */
export async function removeKitchenDocument(id: string): Promise<ActionResult> {
  await requirePermission('kitchen', 'write')
  try {
    const db = dbc()
    const { data: doc } = await db.from('kitchen_documents')
      .select('storage_path, entity_type, entity_id').eq('id', id).maybeSingle()
    if (!doc) return { success: true }

    const { error: rmErr } = await db.storage
      .from(KITCHEN_DOCS_BUCKET).remove([doc.storage_path])
    if (rmErr) return { success: false, error: rmErr.message }

    const { error } = await db.from('kitchen_documents').delete().eq('id', id)
    if (error) return { success: false, error: error.message }

    revalidatePath(`/kitchen/${doc.entity_type}s/${doc.entity_id}`)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
