/**
 * Shared constants for kitchen document uploads.
 *
 * Separate from lib/actions/kitchen-docs.ts because a `'use server'` file may
 * only export async functions — a bucket name exported alongside the actions
 * fails the build.
 */

export const KITCHEN_DOCS_BUCKET = 'kitchen-docs'

export type KitchenDocEntity = 'requisition' | 'delivery' | 'payment'
export type KitchenDocKind = 'photo' | 'receipt' | 'cheque' | 'requisition_form' | 'other'

/** Objects are filed under `<entity>/<id>/`, which the action re-checks. */
export function documentPathPrefix(entity: KitchenDocEntity, id: string): string {
  return `${entity}/${id}`
}
