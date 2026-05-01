'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Lock, Receipt } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { AddChargeModal } from '@/components/checkout/AddChargeModal'
import { CHARGE_CATEGORY_BADGE, CHECKOUT_STATUS_BADGE, CHECKOUT_STATUS_LABELS } from '@/components/checkout/labels'
import { removeCharge } from '@/lib/actions/checkout-charges'
import { formatBDT } from '@/lib/formatters/currency'
import { calcChargesTotal } from '@/lib/checkout/totals'
import type {
  CheckoutChargeWithRefs,
  CheckoutStatus,
  PackageSnapshot,
} from '@/lib/supabase/types'

interface Props {
  bookingId:    string
  canWrite:     boolean
  checkoutStatus: CheckoutStatus | null   // null = no checkout yet
  charges:      CheckoutChargeWithRefs[]
  /** Used by the "Room / Extra Guest" upsale tab — pricing comes from the booking. */
  snapshot?:    PackageSnapshot | null
  nights?:      number | null
  /** Per-guest price for the "Extra Guest" upsale. For daylong = the adult
   *  rate from the booking's line_items. For night = snapshot.extra_person. */
  extraGuestRate?: number | null
}

export function BookingChargesTab({
  bookingId, canWrite, checkoutStatus, charges, snapshot, nights, extraGuestRate,
}: Props) {
  const router  = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  const isLocked = checkoutStatus === 'finalized' || checkoutStatus === 'voided'
  const total    = calcChargesTotal(charges)

  function handleRemove(id: string) {
    if (!confirm('Remove this charge?')) return
    startTransition(async () => {
      const r = await removeCharge(id)
      if (!r.success) { alert(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1.5">
            <Receipt size={14} className="text-violet-600" />
            Charges
          </h3>
          {checkoutStatus && (
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CHECKOUT_STATUS_BADGE[checkoutStatus]}`}>
              {isLocked && <Lock size={10} className="mr-1" />}
              {CHECKOUT_STATUS_LABELS[checkoutStatus]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {checkoutStatus === 'draft' && (
            <Link href={`/checkout/${bookingId}`}>
              <Button variant="outline" size="sm" className="gap-1.5">Open Checkout →</Button>
            </Link>
          )}
          {canWrite && !isLocked && (
            <Button variant="primary" size="sm" onClick={() => setOpen(true)} className="gap-1.5">
              <Plus size={12} /> Add Charge
            </Button>
          )}
        </div>
      </div>

      {charges.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">No charges yet.</p>
          <p className="mt-1 text-xs text-gray-500">
            {canWrite && !isLocked
              ? 'Add restaurant orders, beverages, damage costs, etc. as the guest racks them up.'
              : 'Charges will appear here once added.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {charges.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2 align-top">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                        CHARGE_CATEGORY_BADGE[c.category.slug] ?? 'bg-gray-100 text-gray-700 border-gray-200'
                      }`}>
                        {c.category.display_name}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-gray-900">
                      {c.description}
                      {c.notes && <p className="text-xs text-gray-500">{c.notes}</p>}
                    </td>
                    <td className="px-3 py-2 align-top text-right font-mono tabular-nums">{Number(c.quantity)}</td>
                    <td className="px-3 py-2 align-top text-right font-mono tabular-nums text-gray-700">
                      {formatBDT(Number(c.unit_price))}
                    </td>
                    <td className="px-3 py-2 align-top text-right font-mono tabular-nums font-semibold text-gray-900">
                      {formatBDT(Number(c.amount))}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      {canWrite && !isLocked ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => handleRemove(c.id)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Remove"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : (
                        <Lock size={12} className="text-gray-400" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-right text-gray-700">Total Charges</td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-violet-900">{formatBDT(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <AddChargeModal
        open={open}
        onClose={() => setOpen(false)}
        bookingId={bookingId}
        snapshot={snapshot ?? null}
        nights={nights ?? null}
        extraGuestRate={extraGuestRate ?? null}
      />
    </div>
  )
}
