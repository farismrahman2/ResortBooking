'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ImagePlus, Loader2, Trash2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { attachVisitCard, removeVisitCard } from '@/lib/actions/field-visits'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { safeCall } from '@/lib/actions/safe-call'

export interface CardItem {
  id:            string
  file_name:     string
  contact_label: string | null
  url:           string | null
}

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Visiting-card capture for the field-visit wizard.
 *
 * `capture="environment"` on the camera input opens the rear camera directly
 * on Android/iOS rather than a file browser — the rep is holding the card in
 * front of them, so the shot should be one tap away. A separate gallery input
 * covers the case where they photographed it earlier.
 *
 * Cards attach to the visit rather than to a contact row: saveDraftVisit
 * replaces the whole contacts set on every autosave, so contact ids churn.
 * `contactLabel` snapshots whose card it is at upload time.
 */
export function VisitCardCapture({
  visitId, cards, contactLabel, editable = true, compact,
}: {
  visitId:       string
  cards:         CardItem[]
  contactLabel?: string | null
  editable?:     boolean
  compact?:      boolean
}) {
  const router = useRouter()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<CardItem | null>(null)

  async function upload(file: File) {
    if (!ALLOWED.includes(file.type as typeof ALLOWED[number])) {
      toast.error('Only JPEG, PNG, WebP or HEIC images'); return
    }
    if (file.size > MAX_BYTES) {
      toast.error(`${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the 10 MB limit`); return
    }
    if (file.size === 0) { toast.error('That file is empty'); return }

    setBusy(true)
    try {
      const supabase = createClient()
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_') || 'card.jpg'
      const path = `${visitId}/${Date.now()}-${safe}`

      const { error: upErr } = await supabase.storage
        .from('field-visit-cards')
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) { toast.error(upErr.message); return }

      const r = await safeCall(() => attachVisitCard({
        visit_id: visitId, storage_path: path, file_name: file.name,
        mime_type: file.type, size_bytes: file.size,
        contact_label: contactLabel ?? null,
      }))
      if (!r.success) {
        // Don't leave an orphaned object behind if the metadata insert failed.
        await supabase.storage.from('field-visit-cards').remove([path])
        toast.error(r.error); return
      }
      toast.success('Visiting card saved')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setBusy(false)
      if (cameraRef.current)  cameraRef.current.value = ''
      if (galleryRef.current) galleryRef.current.value = ''
    }
  }

  function handleRemove(card: CardItem) {
    startTransition(async () => {
      const r = await safeCall(() => removeVisitCard(card.id))
      if (!r.success) { toast.error(r.error); return }
      toast.success('Card removed')
      setPreview(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      {cards.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {cards.map((c) => (
            <div key={c.id} className="relative">
              <button
                type="button"
                onClick={() => setPreview(c)}
                className="block h-20 w-32 overflow-hidden rounded-lg border border-gray-300 bg-gray-50"
              >
                {c.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.url} alt={c.contact_label ?? c.file_name}
                       className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-[10px] text-gray-400">
                    Preview unavailable
                  </span>
                )}
              </button>
              {editable && (
                <button
                  type="button"
                  onClick={() => handleRemove(c)}
                  disabled={pending}
                  aria-label="Remove card"
                  className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-red-600 shadow ring-1 ring-gray-200"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={busy}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-700 active:bg-gray-50 disabled:opacity-60',
              compact ? 'min-h-[44px]' : 'min-h-[52px]',
            )}
          >
            {busy
              ? <><Loader2 size={16} className="animate-spin" /> Uploading…</>
              : <><Camera size={16} /> {cards.length ? 'Another card' : 'Photograph card'}</>}
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={busy}
            aria-label="Choose from gallery"
            className={cn(
              'flex w-12 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-gray-500 active:bg-gray-50 disabled:opacity-60',
              compact ? 'min-h-[44px]' : 'min-h-[52px]',
            )}
          >
            <ImagePlus size={16} />
          </button>

          {/* capture="environment" → rear camera opens straight away on mobile */}
          <input
            ref={cameraRef} type="file" accept="image/*" capture="environment"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }}
          />
          <input
            ref={galleryRef} type="file" accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f) }}
          />
        </div>
      )}

      {/* Full-size preview */}
      {preview && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-label="Visiting card"
        >
          <button
            type="button"
            onClick={() => setPreview(null)}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-800"
          >
            <X size={18} />
          </button>
          {preview.url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={preview.contact_label ?? preview.file_name}
                 className="max-h-full max-w-full rounded-lg object-contain"
                 onClick={(e) => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  )
}
