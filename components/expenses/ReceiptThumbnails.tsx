import { File as FileIcon } from 'lucide-react'
import { getSignedAttachmentUrl } from '@/lib/queries/expenses'
import type { ExpenseAttachmentRow } from '@/lib/supabase/types'
import { ReceiptThumbnailsClient } from './ReceiptThumbnailsClient'

interface ReceiptThumbnailsProps {
  expenseId:   string
  attachments: ExpenseAttachmentRow[]
  /** When true, render the "Remove" button per receipt. Used on edit pages. */
  editable?:   boolean
}

/**
 * Server component that pre-signs URLs for every attachment, then hands off
 * to the client component for rendering + remove actions.
 */
export async function ReceiptThumbnails({ expenseId, attachments, editable = false }: ReceiptThumbnailsProps) {
  if (attachments.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic flex items-center gap-1.5">
        <FileIcon size={12} />
        No receipts attached.
      </p>
    )
  }

  const signed = await Promise.all(
    attachments.map(async (a) => {
      let url: string | null = null
      try {
        url = await getSignedAttachmentUrl(a.storage_path)
      } catch {
        url = null
      }
      return { ...a, url }
    }),
  )

  return <ReceiptThumbnailsClient items={signed} editable={editable} />
}
