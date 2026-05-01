'use client'

import { useState } from 'react'
import { Tag, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DiscountModal } from '@/components/checkout/DiscountModal'
import { formatBDT } from '@/lib/formatters/currency'

interface Props {
  checkoutId: string
  /** subtotal = booking.total + chargesTotal */
  subtotal:   number
  current:    {
    amount: number
    pct:    number
    reason: string | null
  }
  /** disabled when checkout is finalized/voided */
  disabled?:  boolean
}

export function DiscountButton({ checkoutId, subtotal, current, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const hasDiscount = current.amount > 0

  if (disabled && !hasDiscount) return null

  return (
    <>
      {hasDiscount ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold text-amber-900 inline-flex items-center gap-1">
              <Tag size={12} /> Discount applied
            </span>
            <span className="font-mono font-bold tabular-nums text-amber-900">
              − {formatBDT(current.amount)}
              {current.pct > 0 && <span className="text-[10px] font-normal text-amber-700"> ({current.pct}%)</span>}
            </span>
          </div>
          {current.reason && (
            <p className="text-[11px] text-amber-800 italic">&ldquo;{current.reason}&rdquo;</p>
          )}
          {!disabled && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} className="gap-1 -ml-2">
              <Pencil size={11} /> Edit / remove
            </Button>
          )}
        </div>
      ) : (
        <Button type="button" variant="outline" size="md" onClick={() => setOpen(true)} className="gap-1.5 w-full">
          <Tag size={14} /> Apply discount
        </Button>
      )}
      <DiscountModal
        open={open}
        onClose={() => setOpen(false)}
        checkoutId={checkoutId}
        subtotal={subtotal}
        current={hasDiscount ? current : null}
      />
    </>
  )
}
