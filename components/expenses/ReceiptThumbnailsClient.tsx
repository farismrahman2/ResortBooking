'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { File as FileIcon, Trash2, ExternalLink } from 'lucide-react'
import { removeReceipt } from '@/lib/actions/expenses'
import type { ExpenseAttachmentRow } from '@/lib/supabase/types'

interface SignedItem extends ExpenseAttachmentRow {
  url: string | null
}

interface Props {
  items:    SignedItem[]
  editable: boolean
}

export function ReceiptThumbnailsClient({ items, editable }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)

  function handleRemove(id: string) {
    if (!confirm('Remove this receipt? The file is deleted from storage.')) return
    setError(null)
    startTransition(async () => {
      const result = await removeReceipt(id)
      if (!result.success) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((a) => {
          const isImage = a.mime_type.startsWith('image/')
          return (
            <div key={a.id} className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex flex-col">
              {/* Preview */}
              <div className="aspect-[4/3] bg-white flex items-center justify-center">
                {isImage && a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.file_name} className="max-h-full max-w-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-gray-400">
                    <FileIcon size={28} />
                    <span className="text-[10px] uppercase tracking-wider">
                      {a.mime_type === 'application/pdf' ? 'PDF' : a.mime_type}
                    </span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 px-2 py-1.5 flex items-center justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium text-gray-700 truncate" title={a.file_name}>{a.file_name}</p>
                  <p className="text-[9px] text-gray-400 tabular-nums">{(a.size_bytes / 1024).toFixed(0)} KB</p>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {a.url && (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-forest-700"
                      title="Open in new tab"
                    >
                      <ExternalLink size={11} />
                    </a>
                  )}
                  {editable && (
                    <button
                      type="button"
                      onClick={() => handleRemove(a.id)}
                      disabled={pending}
                      className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-50"
                      title="Remove receipt"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
