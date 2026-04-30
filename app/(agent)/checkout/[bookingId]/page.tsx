import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Phone } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/Button'
import { MigrationErrorBanner } from '@/components/checkout/MigrationErrorBanner'
import { CheckoutSummary } from '@/components/checkout/CheckoutSummary'
import { PaymentForm } from '@/components/checkout/PaymentForm'
import { FinalizeAndVoid } from '@/components/checkout/FinalizeAndVoid'
import { BookingChargesTab } from '@/components/checkout/BookingChargesTab'
import { CHECKOUT_STATUS_BADGE, CHECKOUT_STATUS_LABELS } from '@/components/checkout/labels'
import { getBookingById } from '@/lib/queries/bookings'
import {
  getCheckoutByBooking,
  getChargesByCheckout,
  getPaymentsByCheckout,
} from '@/lib/queries/checkout'
import { listChargeCategories, listChargeItems } from '@/lib/queries/charge-catalog'
import { calcChargesTotal, calcPaymentsTotal, calcNetDue } from '@/lib/checkout/totals'
import {
  requirePermission,
  hasPermission,
  isAdmin as checkAdmin,
} from '@/lib/auth/permissions'
import { formatDate, formatDateRange } from '@/lib/formatters/dates'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { bookingId: string }
}

export default async function CheckoutDetailPage({ params }: PageProps) {
  await requirePermission('checkout', 'read')

  const [booking, canWrite, isAdmin] = await Promise.all([
    getBookingById(params.bookingId),
    hasPermission('checkout', 'write'),
    checkAdmin(),
  ])
  if (!booking) notFound()

  let migrationError: string | null = null
  let categories: Awaited<ReturnType<typeof listChargeCategories>> = []
  let items: Awaited<ReturnType<typeof listChargeItems>> = []
  let checkout: Awaited<ReturnType<typeof getCheckoutByBooking>> = null
  let charges: Awaited<ReturnType<typeof getChargesByCheckout>> = []
  let payments: Awaited<ReturnType<typeof getPaymentsByCheckout>> = []
  try {
    [categories, items, checkout] = await Promise.all([
      listChargeCategories(),
      listChargeItems(),
      getCheckoutByBooking(booking.id),
    ])
    if (checkout) {
      [charges, payments] = await Promise.all([
        getChargesByCheckout(checkout.id),
        getPaymentsByCheckout(checkout.id),
      ])
    }
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  const advance       = Number(booking.advance_paid)
  const chargesTotal  = calcChargesTotal(charges)
  const paymentsTotal = calcPaymentsTotal(payments)
  const netDue        = calcNetDue(chargesTotal, advance, paymentsTotal)

  const isLocked = checkout?.status === 'finalized' || checkout?.status === 'voided'

  return (
    <div className="flex h-full flex-col">
      <Topbar title={`Checkout — ${booking.booking_number}`} subtitle={booking.customer_name} />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        {migrationError && <MigrationErrorBanner error={migrationError} />}

        {/* Back nav */}
        <div className="flex items-center justify-between">
          <Link href="/checkout" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-violet-700">
            <ArrowLeft size={14} /> Back to list
          </Link>
          {checkout && (
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${CHECKOUT_STATUS_BADGE[checkout.status]}`}>
              {CHECKOUT_STATUS_LABELS[checkout.status]}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* LEFT — Booking + Charges + Payments */}
          <div className="lg:col-span-2 space-y-5">
            {/* Guest header */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-gray-500">Guest</p>
                  <p className="mt-0.5 text-base font-semibold text-gray-900">{booking.customer_name}</p>
                  <p className="text-xs text-gray-500 inline-flex items-center gap-1.5">
                    <Phone size={11} /> {booking.customer_phone}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider font-semibold text-gray-500">Stay</p>
                  <p className="mt-0.5 text-sm text-gray-900">
                    {booking.check_out_date
                      ? formatDateRange(booking.visit_date, booking.check_out_date)
                      : `${formatDate(booking.visit_date)} (Daylong)`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {booking.adults} adult{booking.adults === 1 ? '' : 's'}
                    {(booking.children_paid + booking.children_free) > 0
                      ? `, ${booking.children_paid + booking.children_free} children`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 border-t border-gray-100 pt-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-500">Booking Total</p>
                  <p className="font-mono tabular-nums text-gray-900">{formatBDT(booking.total)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-500">Advance Paid</p>
                  <p className="font-mono tabular-nums text-gray-900">{formatBDT(booking.advance_paid)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-semibold text-gray-500">Booking Status</p>
                  <p className="text-gray-700">{booking.status}</p>
                </div>
              </div>
            </div>

            {/* Charges */}
            {!migrationError && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                <BookingChargesTab
                  bookingId={booking.id}
                  canWrite={canWrite}
                  checkoutStatus={checkout?.status ?? null}
                  charges={charges}
                  categories={categories}
                  items={items}
                />
              </div>
            )}

            {/* Payments */}
            {!migrationError && checkout && (
              <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Payments at Checkout</h3>
                <PaymentForm
                  checkoutId={checkout.id}
                  payments={payments}
                  suggestedAmount={netDue > 0 ? netDue : undefined}
                  disabled={isLocked}
                />
              </div>
            )}
          </div>

          {/* RIGHT — Sticky bill summary + actions */}
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <CheckoutSummary
              advance={advance}
              chargesTotal={chargesTotal}
              paymentsTotal={paymentsTotal}
              netDue={netDue}
            />

            {checkout ? (
              <FinalizeAndVoid
                checkout={{
                  ...checkout,
                  booking,
                  charges,
                  payments,
                }}
                totals={{ advance, chargesTotal, paymentsTotal, netDue }}
                isAdmin={isAdmin}
                canWrite={canWrite}
              />
            ) : (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                Add the first charge to start a checkout for this booking.
              </div>
            )}

            {checkout?.refund_expense_id && (
              <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
                Refund of <span className="font-mono font-bold">{formatBDT(Number(checkout.refund_amount))}</span>{' '}
                recorded as expense.{' '}
                <Link href={`/expenses/${checkout.refund_expense_id}`} className="underline font-semibold">
                  View expense →
                </Link>
              </div>
            )}

            {checkout?.status === 'voided' && (
              <div className="rounded-xl border border-gray-300 bg-gray-100 p-3 text-xs text-gray-700">
                <p className="font-semibold">Voided</p>
                {checkout.void_reason && <p className="mt-1 italic">Reason: {checkout.void_reason}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
