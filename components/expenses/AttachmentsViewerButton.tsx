'use client'

import { useState } from 'react'
import { Paperclip, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { ReceiptThumbnailsClient } from '@/components/expenses/ReceiptThumbnailsClient'
import type { ExpenseAttachmentRow } from '@/lib/supabase/types'

interface AttachmentsViewerButtonProps {
  expenseId:       string
  attachmentCount: number
}

interface SignedItem extends ExpenseAttachmentRow {
  url: string | null
}

/**
 * Inline paperclip button shown in the expense list. Click → modal that
 * lazy-fetches signed URLs and renders thumbnails so the user can view
 * receipts without leaving the list.
 */
export function AttachmentsViewerButton({ expenseId, attachmentCount }: AttachmentsViewerButtonProps) {
  const [open, setOpen]     = useState(false)
  const [items, setItems]   = useState<SignedItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  if (attachmentCount === 0) return null

  async function loadAttachments() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/expenses/${expenseId}/attachments`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
      } else {
        setItems(data.rows ?? [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  function handleOpen(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setOpen(true)
    if (items.length === 0) loadAttachments()
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title={`View ${attachmentCount} receipt${attachmentCount !== 1 ? 's' : ''}`}
        className="inline-flex items-center gap-0.5 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-forest-700 transition-colors"
      >
        <Paperclip size={13} />
        <span className="text-[10px] font-mono">{attachmentCount}</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Receipts (${attachmentCount})`} size="lg">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
            <Loader2 size={14} className="animate-spin" />
            Loading…
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 italic py-4 text-center">No receipts.</p>
        ) : (
          <ReceiptThumbnailsClient items={items} editable={false} />
        )}
      </Modal>
    </>
  )
}
