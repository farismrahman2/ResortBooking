'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CloudOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { syncOfflineVisit } from '@/lib/actions/field-visits'
import { attachVisitCard } from '@/lib/actions/field-visits'
import { createClient } from '@/lib/supabase/client'
import {
  listPending, listPhotos, putVisit, deleteVisit, deletePhoto,
  type QueuedVisit,
} from '@/lib/field-visits/offline-store'

/**
 * Shows connectivity state and flushes the offline queue.
 *
 * Sync is attempted on mount, whenever the browser reports it's back online,
 * and manually from the button. Each visit is independent — one failure never
 * blocks the rest of the queue, and a failed item stays queued for the next
 * attempt rather than being dropped.
 */
export function OfflineSync({ compact }: { compact?: boolean }) {
  const router = useRouter()
  const [online, setOnline]   = useState(true)
  const [pending, setPending] = useState<QueuedVisit[]>([])
  const [syncing, setSyncing] = useState(false)
  const running = useRef(false)

  const refresh = useCallback(async () => {
    setPending(await listPending())
  }, [])

  const flush = useCallback(async (announce: boolean) => {
    // Guard against the mount effect and the online event racing each other.
    if (running.current || typeof navigator === 'undefined' || !navigator.onLine) return
    const queue = await listPending()
    if (queue.length === 0) return

    running.current = true
    setSyncing(true)
    let ok = 0, failed = 0

    for (const v of queue) {
      try {
        await putVisit({ ...v, status: 'syncing' })
        const r = await syncOfflineVisit({
          localId:   v.localId,
          payload:   v.payload,
          submitted: v.submitted,
          gps:       v.gps,
        })
        if (!r.success) {
          await putVisit({ ...v, status: 'failed', attempts: v.attempts + 1, lastError: r.error })
          failed++
          continue
        }

        // Photos ride along after the visit row exists, so the FK is satisfied.
        const photos = await listPhotos(v.localId)
        for (const p of photos) {
          try {
            const supabase = createClient()
            const safe = p.fileName.replace(/[^a-zA-Z0-9._-]/g, '_') || 'card.jpg'
            const path = `${v.localId}/${p.createdAt}-${safe}`
            const { error: upErr } = await supabase.storage
              .from('field-visit-cards')
              .upload(path, p.blob, { contentType: p.mimeType, upsert: true })
            if (upErr) continue        // leave it queued for the next run
            const res = await attachVisitCard({
              visit_id: v.localId, storage_path: path, file_name: p.fileName,
              mime_type: p.mimeType, size_bytes: p.blob.size, contact_label: p.label,
            })
            if (res.success) await deletePhoto(p.id)
          } catch { /* keep the photo queued */ }
        }

        // Only drop the local copy once the server has it.
        const left = await listPhotos(v.localId)
        if (left.length === 0) await deleteVisit(v.localId)
        else await putVisit({ ...v, status: 'pending', lastError: 'Some photos still uploading' })
        ok++
      } catch (err) {
        await putVisit({
          ...v, status: 'failed', attempts: v.attempts + 1,
          lastError: err instanceof Error ? err.message : String(err),
        })
        failed++
      }
    }

    running.current = false
    setSyncing(false)
    await refresh()

    if (announce || ok > 0) {
      if (ok > 0) {
        toast.success(`${ok} offline visit${ok === 1 ? '' : 's'} synced`, {
          description: failed > 0 ? `${failed} still queued — will retry.` : undefined,
        })
        router.refresh()
      } else if (failed > 0) {
        toast.error(`${failed} visit${failed === 1 ? '' : 's'} could not sync yet`, {
          description: 'They stay saved on this device and will retry.',
        })
      }
    }
  }, [refresh, router])

  useEffect(() => {
    setOnline(navigator.onLine)
    void refresh()
    void flush(false)

    const goOnline  = () => { setOnline(true);  void flush(true) }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [refresh, flush])

  const count = pending.length
  if (online && count === 0) {
    return compact ? null : (
      <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
        <CheckCircle2 size={11} /> All visits synced
      </span>
    )
  }

  return (
    <div className={cn(
      'flex items-center gap-2 rounded-xl border px-3 py-2',
      !online ? 'border-amber-300 bg-amber-50' : 'border-blue-300 bg-blue-50',
    )}>
      {!online
        ? <CloudOff size={15} className="flex-shrink-0 text-amber-600" />
        : <AlertTriangle size={15} className="flex-shrink-0 text-blue-600" />}
      <div className="min-w-0 flex-1">
        <p className={cn('text-xs font-semibold', !online ? 'text-amber-900' : 'text-blue-900')}>
          {!online ? 'Offline' : 'Waiting to sync'}
          {count > 0 && ` · ${count} visit${count === 1 ? '' : 's'} on this device`}
        </p>
        <p className={cn('text-[11px]', !online ? 'text-amber-700' : 'text-blue-700')}>
          {!online
            ? 'You can keep logging visits — they upload when you get signal.'
            : 'Tap sync, or it will upload on its own.'}
        </p>
      </div>
      {online && count > 0 && (
        <button
          type="button"
          onClick={() => flush(true)}
          disabled={syncing}
          className="flex min-h-[36px] flex-shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          <RefreshCw size={12} className={syncing ? 'animate-spin' : undefined} />
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      )}
    </div>
  )
}
