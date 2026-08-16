'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { confirmDelivery } from '@/lib/actions/kitchen-ledger'
import { safeCall } from '@/lib/actions/safe-call'

/**
 * Confirm a draft straight from the detail page. The edit form has its own
 * confirm, but the natural path after reviewing a saved draft is THIS page —
 * and it used to offer no way forward, so drafts sat unconfirmed (and
 * unbillable) until someone thought to reopen the editor.
 */
export function ConfirmDeliveryButton({ deliveryId }: { deliveryId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => {
        const r = await safeCall(() => confirmDelivery(deliveryId))
        if (!r.success) { toast.error(r.error); return }
        toast.success('Delivery confirmed', { description: 'The bill message is ready to send.' })
        router.refresh()
      })}
      className="inline-flex items-center gap-1.5 rounded-lg bg-forest-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
    >
      <CheckCircle2 size={12} /> {pending ? 'Confirming…' : 'Confirm delivery'}
    </button>
  )
}
