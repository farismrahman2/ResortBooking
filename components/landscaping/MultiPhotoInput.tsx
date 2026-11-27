'use client'

import { useRef, useState } from 'react'
import { Camera, ImagePlus, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 10

/** First path → the record's main photo column; the rest → extra_photo_paths. */
export const splitPhotos = (paths: string[]) => ({ first: paths[0] ?? null, extra: paths.slice(1) })
export const joinPhotos = (first: string | null | undefined, extra: string[] | null | undefined) =>
  [first, ...(extra ?? [])].filter(Boolean) as string[]

/**
 * Several photos or PDFs at once — choose many from the gallery, or snap one
 * at a time with the camera. Uploads to the private 'landscaping-bills'
 * bucket and hands back the list of paths.
 */
export function MultiPhotoInput({ value, onChange, label = 'Photos' }: {
  value: string[]; onChange: (paths: string[]) => void; label?: string
}) {
  const pick = useRef<HTMLInputElement>(null)
  const cam = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(0)

  async function upload(files: File[]) {
    const room = MAX_FILES - value.length
    if (room <= 0) { toast.error(`Up to ${MAX_FILES} files`); return }
    const ok = files.filter((f) => {
      if (!ALLOWED.includes(f.type)) { toast.error(`${f.name}: photos or PDF only`); return false }
      if (f.size > MAX_BYTES) { toast.error(`${f.name}: max 10 MB`); return false }
      return true
    }).slice(0, room)
    if (!ok.length) return
    setBusy(ok.length)
    const month = new Date().toISOString().slice(0, 7)
    const done = await Promise.all(ok.map(async (file) => {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${month}/${crypto.randomUUID()}.${ext}`
      const { error } = await createClient().storage.from('landscaping-bills').upload(path, file, { contentType: file.type })
      if (error) { toast.error(`${file.name}: ${error.message}`); return null }
      return path
    }))
    setBusy(0)
    const added = done.filter(Boolean) as string[]
    if (added.length) onChange([...value, ...added])
  }

  const btn = 'inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-dashed border-gray-400 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50'
  return (
    <div>
      <label className="field-label">{label}</label>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((p, i) => (
            <li key={p} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 pl-2.5 text-sm text-emerald-800">
              {p.toLowerCase().endsWith('.pdf') ? 'PDF' : 'Photo'} {i + 1}
              <button type="button" aria-label={`Remove file ${i + 1}`} onClick={() => onChange(value.filter((x) => x !== p))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-emerald-100"><X size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button type="button" className={btn} disabled={busy > 0} onClick={() => pick.current?.click()}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
          {busy ? `Uploading ${busy}…` : value.length ? 'Add more' : 'Add photos'}
        </button>
        <button type="button" className={btn} disabled={busy > 0} onClick={() => cam.current?.click()}>
          <Camera size={15} /> Camera
        </button>
      </div>
      <p className="mt-1 text-xs text-gray-500">Photos or PDF — you can pick several at once (up to {MAX_FILES}).</p>
      <input ref={pick} type="file" multiple accept="image/*,application/pdf" className="hidden"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void upload(fs); e.target.value = '' }} />
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) void upload(fs); e.target.value = '' }} />
    </div>
  )
}
