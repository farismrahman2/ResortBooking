'use client'

import { useRef, useState } from 'react'
import { Camera, Loader2, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from '@/lib/toast'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Photograph the bill or challan. Uploads straight to the private
 * 'landscaping-bills' bucket (landscaping staff only) and hands back its path.
 */
export function PhotoInput({ value, onChange, label = 'Photo of the bill' }: {
  value: string | null; onChange: (path: string | null) => void; label?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function upload(file: File) {
    if (!ALLOWED.includes(file.type)) { toast.error('Photos or PDF only'); return }
    if (file.size > MAX_BYTES) { toast.error('Max 10 MB'); return }
    setBusy(true)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
    const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`
    const { error } = await createClient().storage.from('landscaping-bills').upload(path, file, { contentType: file.type })
    setBusy(false)
    if (error) { toast.error(`Upload failed: ${error.message}`); return }
    onChange(path)
  }

  return (
    <div>
      <label className="field-label">{label}</label>
      {value ? (
        <div className="flex min-h-[42px] items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm text-emerald-800">
          <span className="min-w-0 flex-1 truncate">Photo attached</span>
          <button type="button" onClick={() => onChange(null)} aria-label="Remove photo"
            className="-mr-2 inline-flex min-h-[40px] flex-shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium text-emerald-800 hover:bg-emerald-100">
            <X size={15} /> Remove
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()} disabled={busy}
          className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-400 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />} {busy ? 'Uploading…' : 'Take or choose a photo'}
        </button>
      )}
      <input ref={ref} type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
    </div>
  )
}
