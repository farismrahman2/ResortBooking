'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { discardDraftVisit } from '@/lib/actions/field-visits'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'

/** Clears an unwanted draft. Drafts never reached the CRM, so this is a real delete. */
export function DiscardDraftButton({
  visitId, label, iconOnly, className,
}: {
  visitId:   string
  label?:    string | null
  iconOnly?: boolean
  className?: string
}) {
  const router  = useRouter()
  const confirm = useConfirm()
  const [pending, startTransition] = useTransition()

  async function handle(e: React.MouseEvent) {
    // Draft rows sit inside a <Link> in the list — don't navigate on delete.
    e.preventDefault()
    e.stopPropagation()
    const ok = await confirm({
      title: label ? `Discard "${label}"?` : 'Discard this draft?',
      description: 'It was never submitted, so nothing is lost from your records.',
      confirmLabel: 'Discard',
      danger: true,
    })
    if (!ok) return
    startTransition(async () => {
      const r = await discardDraftVisit(visitId)
      if (!r.success) { toast.error(r.error); return }
      toast.success('Draft discarded')
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      aria-label="Discard draft"
      className={cn(
        'flex flex-shrink-0 items-center justify-center gap-1.5 rounded-lg text-red-500 active:bg-red-50 disabled:opacity-50',
        iconOnly ? 'h-10 w-10' : 'min-h-[40px] px-3 text-xs font-medium',
        className,
      )}
    >
      <Trash2 size={15} />
      {!iconOnly && 'Discard draft'}
    </button>
  )
}
