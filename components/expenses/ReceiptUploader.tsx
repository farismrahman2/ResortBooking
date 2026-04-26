'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { attachReceipt } from '@/lib/actions/expenses'

interface ReceiptUploaderProps {
  expenseId: string
  /** ISO date of the expense — used to organize the storage path by year/month. */
  expenseDate: string
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const
const MAX_BYTES    = 10 * 1024 * 1024  // 10 MB

export function ReceiptUploader({ expenseId, expenseDate }: ReceiptUploaderProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)
  const [progress, setProgress]    = useState<string | null>(null)
  const [dragging, setDragging]    = useState(false)

  async function uploadOne(file: File): Promise<string | null> {
    if (!ALLOWED_MIME.includes(file.type as typeof ALLOWED_MIME[number])) {
      return `${file.name}: only JPEG, PNG, WebP, or PDF accepted`
    }
    if (file.size > MAX_BYTES) {
      return `${file.name}: ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds 10 MB limit`
    }
    if (file.size === 0) {
      return `${file.name}: empty file`
    }

    const supabase = createClient()
    // Path: <YYYY>/<MM>/<expense_id>/<timestamp>-<filename>
    const [y, m] = expenseDate.split('-')
    const timestamp = Date.now()
    const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${y}/${m}/${expenseId}/${timestamp}-${safeName}`

    const { error: uploadError } = await supabase
      .storage
      .from('expense-receipts')
      .upload(storagePath, file, { contentType: file.type, upsert: false })

    if (uploadError) return `${file.name}: ${uploadError.message}`

    // Record the attachment row server-side
    const result = await attachReceipt({
      expense_id:   expenseId,
      storage_path: storagePath,
      file_name:    file.name,
      mime_type:    file.type as typeof ALLOWED_MIME[number],
      size_bytes:   file.size,
    })

    if (!result.success) {
      // Best-effort cleanup if metadata insert fails
      await supabase.storage.from('expense-receipts').remove([storagePath])
      return `${file.name}: ${result.error}`
    }
    return null
  }

  function handleFiles(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return
    const files = Array.from(filesList)
    setError(null)
    setProgress(`Uploading ${files.length} file${files.length !== 1 ? 's' : ''}…`)

    startTransition(async () => {
      const errors: string[] = []
      let i = 0
      for (const f of files) {
        i += 1
        setProgress(`Uploading ${i} of ${files.length}: ${f.name}`)
        const err = await uploadOne(f)
        if (err) errors.push(err)
      }
      setProgress(null)
      if (errors.length > 0) {
        setError(errors.join('\n'))
      }
      router.refresh()
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed transition-colors ${
          dragging
            ? 'border-forest-500 bg-forest-50'
            : pending
            ? 'border-gray-300 bg-gray-50'
            : 'border-gray-300 bg-white hover:border-forest-400 hover:bg-forest-50/50'
        }`}
      >
        <button
          type="button"
          disabled={pending}
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex flex-col items-center gap-2 px-4 py-6 text-sm disabled:cursor-not-allowed"
        >
          {pending
            ? <Loader2 size={20} className="text-forest-700 animate-spin" />
            : <Upload size={20} className="text-gray-400" />
          }
          <span className="font-medium text-gray-700">
            {pending ? 'Uploading…' : 'Click to upload or drag files here'}
          </span>
          <span className="text-[10px] text-gray-400">
            JPEG, PNG, WebP, PDF · max 10 MB each
          </span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          disabled={pending}
          className="hidden"
        />
      </div>

      {progress && <p className="text-xs text-gray-500">{progress}</p>}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}
    </div>
  )
}
