'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ReceiptText, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getOrCreateDraftCheckout } from '@/lib/actions/checkout-charges'

interface Props {
  bookingId: string
}

export function StartCheckoutButton({ bookingId }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const r = await getOrCreateDraftCheckout(bookingId)
      if (!r.success) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
      <p className="text-xs text-violet-900">
        No charges yet. Start the checkout to record payments, apply a discount, or finalize the bill.
      </p>
      <Button
        type="button"
        variant="primary"
        size="md"
        onClick={handleClick}
        disabled={pending}
        className="gap-1.5 w-full"
      >
        <ReceiptText size={14} />
        {pending ? 'Starting…' : 'Start Checkout'}
      </Button>
      {error && (
        <p className="inline-flex items-center gap-1 text-[11px] text-red-700">
          <AlertCircle size={11} /> {error}
        </p>
      )}
    </div>
  )
}
