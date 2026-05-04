'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { voidCoffeeShopSale } from '@/lib/actions/coffee-shop'

export function VoidSaleButton({ saleId }: { saleId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    const reason = window.prompt('Reason for voiding this sale (required):', '')
    if (!reason || reason.trim().length < 3) {
      setError('Reason is required (min 3 characters).')
      return
    }
    setError(null)
    startTransition(async () => {
      const r = await voidCoffeeShopSale(saleId, reason.trim())
      if (!r.success) { setError(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="md" onClick={handleClick} disabled={pending} className="w-full gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50">
        <Ban size={14} /> Void sale
      </Button>
      {error && (
        <div className="flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
          <AlertCircle size={12} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
    </div>
  )
}
