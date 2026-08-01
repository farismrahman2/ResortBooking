/**
 * IndexedDB store for field visits captured with no connectivity.
 *
 * Why IndexedDB rather than the localStorage we already use: localStorage is
 * ~5 MB, synchronous, and string-only. Card photos are blobs and a single
 * phone snap can be 2-4 MB, so the existing localStorage draft would blow its
 * quota on the first picture. IndexedDB stores blobs natively and has orders
 * of magnitude more room.
 *
 * The localStorage draft is NOT removed — it stays as the in-form crash
 * safety net for the online path. This store is specifically the offline
 * queue: complete visits waiting for a network.
 */

const DB_NAME    = 'gcr-field-visits'
const DB_VERSION = 1
const VISITS     = 'visits'
const PHOTOS     = 'photos'

export type QueuedStatus = 'draft' | 'pending' | 'syncing' | 'failed'

export interface QueuedVisit {
  /** Client-generated UUID — becomes the real row id on sync. */
  localId:    string
  status:     QueuedStatus
  /** Full wizard payload, same shape saveDraftVisit/submit expect. */
  payload:    Record<string, unknown>
  /** Whether the rep pressed Submit (vs just leaving it as a draft). */
  submitted:  boolean
  gps:        { lat: number; lng: number } | null
  createdAt:  number
  updatedAt:  number
  attempts:   number
  lastError:  string | null
}

export interface QueuedPhoto {
  id:        string
  localId:   string      // visit it belongs to
  blob:      Blob
  fileName:  string
  mimeType:  string
  label:     string | null
  createdAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(VISITS)) {
        db.createObjectStore(VISITS, { keyPath: 'localId' })
      }
      if (!db.objectStoreNames.contains(PHOTOS)) {
        const s = db.createObjectStore(PHOTOS, { keyPath: 'id' })
        s.createIndex('by_visit', 'localId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode)
    const r = fn(t.objectStore(store))
    r.onsuccess = () => resolve(r.result as T)
    r.onerror   = () => reject(r.error)
  }))
}

// ─── Visits ─────────────────────────────────────────────────────────────────

export async function putVisit(v: QueuedVisit): Promise<void> {
  await tx(VISITS, 'readwrite', (s) => s.put({ ...v, updatedAt: Date.now() }))
}

export async function getVisit(localId: string): Promise<QueuedVisit | null> {
  try { return (await tx<QueuedVisit>(VISITS, 'readonly', (s) => s.get(localId))) ?? null }
  catch { return null }
}

export async function listVisits(): Promise<QueuedVisit[]> {
  try {
    const all = await tx<QueuedVisit[]>(VISITS, 'readonly', (s) => s.getAll())
    return (all ?? []).sort((a, b) => a.createdAt - b.createdAt)
  } catch { return [] }
}

/** Everything the rep has finished but that hasn't reached the server. */
export async function listPending(): Promise<QueuedVisit[]> {
  return (await listVisits()).filter((v) => v.status === 'pending' || v.status === 'failed')
}

export async function deleteVisit(localId: string): Promise<void> {
  await tx(VISITS, 'readwrite', (s) => s.delete(localId))
  for (const p of await listPhotos(localId)) await deletePhoto(p.id)
}

// ─── Photos ─────────────────────────────────────────────────────────────────

export async function putPhoto(p: QueuedPhoto): Promise<void> {
  await tx(PHOTOS, 'readwrite', (s) => s.put(p))
}

export async function listPhotos(localId: string): Promise<QueuedPhoto[]> {
  try {
    const db = await openDb()
    return await new Promise<QueuedPhoto[]>((resolve, reject) => {
      const t = db.transaction(PHOTOS, 'readonly')
      const r = t.objectStore(PHOTOS).index('by_visit').getAll(localId)
      r.onsuccess = () => resolve((r.result ?? []) as QueuedPhoto[])
      r.onerror   = () => reject(r.error)
    })
  } catch { return [] }
}

export async function deletePhoto(id: string): Promise<void> {
  await tx(PHOTOS, 'readwrite', (s) => s.delete(id))
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Stable id that works on older Android WebViews without crypto.randomUUID. */
export function newLocalId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * Rough storage headroom. Budget Android phones can be tight, and silently
 * failing to store a photo would be the worst possible outcome here.
 */
export async function storageHeadroom(): Promise<{ usedMb: number; quotaMb: number; tight: boolean } | null> {
  try {
    if (!navigator.storage?.estimate) return null
    const { usage = 0, quota = 0 } = await navigator.storage.estimate()
    const usedMb  = usage / 1024 / 1024
    const quotaMb = quota / 1024 / 1024
    return { usedMb, quotaMb, tight: quotaMb > 0 && quotaMb - usedMb < 25 }
  } catch { return null }
}
