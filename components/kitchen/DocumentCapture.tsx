'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ImagePlus, Loader2, Trash2, X, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { attachKitchenDocument, removeKitchenDocument } from '@/lib/actions/kitchen-docs'
import {
  KITCHEN_DOCS_BUCKET, documentPathPrefix,
  type KitchenDocEntity, type KitchenDocKind,
} from '@/lib/kitchen/documents'
import { safeCall } from '@/lib/actions/safe-call'

export interface KitchenDoc {
  id:        string
  file_name: string
  kind:      string
  caption:   string | null
  url:       string | null
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'] as const
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Photograph the paper — the requisition form, the supplier's receipt book
 * page, the cheque.
 *
 * The paper doesn't stop existing because the numbers are typed in. When a
 * total is disputed a fortnight later, the argument is settled by the memo in
 * the receipt book, and the only copy of it is a photo on somebody's phone.
 *
 * `capture="environment"` opens the rear camera directly rather than a file
 * browser: the slip is in the storekeeper's other hand. A separate gallery
 * input covers the photo already taken this morning.
 */
export function DocumentCapture({
  entityType, entityId, docs, kind = 'photo', label, hint, editable = true,
}: {
  entityType: KitchenDocEntity
  entityId:   string
  docs:       KitchenDoc[]
  kind?:      KitchenDocKind
  label:      string
  hint?:      string
  editable?:  boolean
}) {
  const router = useRouter()
  const cameraRef  = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<KitchenDoc | null>(null)

  async function upload(file: File) {
    if (!ALLOWED.includes(file.type as typeof ALLOWED[number])) {
      toast.error('Photos or PDF only'); return
    }
    if (file.size > MAX_BYTES) {
      toast.error(`${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 10 MB limit`); return
    }
    if (file.size === 0) { toast.error('That file is empty'); return }

    setBusy(true)
    try {
      const supabase = createClient()
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'photo.jpg'
      const path = `${documentPathPrefix(entityType, entityId)}/${Date.now()}-${safe}`

      const { error: upErr } = await supabase.storage
        .from(KITCHEN_DOCS_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) { toast.error(upErr.message); return }

      const r = await safeCall(() => attachKitchenDocument({
        entity_type: entityType, entity_id: entityId,
        storage_path: path, file_name: file.name,
        mime_type: file.type, size_bytes: file.size, kind,
      }))
      if (!r.success) {
        // Don't leave an object nobody has a path to in a private bucket.
        await supabase.storage.from(KITCHEN_DOCS_BUCKET).remove([path])
        toast.error(r.error); return
      }
      toast.success('Photo saved')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (cameraRef.current)  cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
        <FileText size={13} /> {label}
        {docs.length > 0 && <span className="font-normal text-gray-400">· {docs.length}</span>}
      </p>

      {docs.length > 0 && (
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {docs.map((d) => (
            <li key={d.id} className="group relative">
              <button
                type="button" onClick={() => setPreview(d)}
                className="block aspect-square w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
              >
                {d.url && d.file_name.toLowerCase().endsWith('.pdf') ? (
                  <span className="flex h-full w-full items-center justify-center text-gray-400">
                    <FileText size={22} />
                  </span>
                ) : d.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.url} alt={d.file_name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">
                    no preview
                  </span>
                )}
              </button>
              {editable && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(async () => {
                    const r = await safeCall(() => removeKitchenDocument(d.id))
                    if (!r.success) { toast.error(r.error); return }
                    toast.success('Photo removed')
                    router.refresh()
                  })}
                  aria-label={`Remove ${d.file_name}`}
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <>
          <div className="mt-2 flex gap-2">
            <button
              type="button" onClick={() => cameraRef.current?.click()} disabled={busy}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 disabled:opacity-50"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
              {busy ? 'Uploading…' : 'Photo'}
            </button>
            <button
              type="button" onClick={() => galleryRef.current?.click()} disabled={busy}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 disabled:opacity-50"
            >
              <ImagePlus size={15} /> Gallery
            </button>
          </div>
          <input
            ref={cameraRef} type="file" accept="image/*" capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }}
          />
          <input
            ref={galleryRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }}
          />
        </>
      )}

      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-gray-500">{hint}</p>}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
          role="dialog"
        >
          <button
            type="button" onClick={() => setPreview(null)} aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <X size={18} />
          </button>
          {preview.url && (
            preview.file_name.toLowerCase().endsWith('.pdf')
              // eslint-disable-next-line jsx-a11y/iframe-has-title
              ? <iframe src={preview.url} className="h-[80vh] w-full max-w-3xl rounded-lg bg-white" />
              // eslint-disable-next-line @next/next/no-img-element
              : <img
                  src={preview.url} alt={preview.file_name}
                  className={cn('max-h-[85vh] max-w-full rounded-lg object-contain')}
                  onClick={(e) => e.stopPropagation()}
                />
          )}
        </div>
      )}
    </div>
  )
}
