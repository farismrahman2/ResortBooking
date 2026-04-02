'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { updateQuoteStatus, deleteQuote } from '@/lib/actions/quotes'
import { convertQuoteToBooking } from '@/lib/actions/bookings'
import type { QuoteRow } from '@/lib/supabase/types'

interface QuoteActionsProps {
  quote: QuoteRow
  bookingId?: string
}

export function QuoteActions({ quote, bookingId }: QuoteActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAction(
    action: () => Promise<{ success: boolean; error?: string }>,
    key: string,
  ) {
    setLoading(key)
    setError(null)
    try {
      const result = await action()
      if (!result.success) {
        setError(result.error ?? 'Action failed')
      } else {
        router.refresh()
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(null)
    }
  }

  async function handleConvert() {
    setLoading('convert')
    setError(null)
    try {
      const result = await convertQuoteToBooking(quote.id)
      if (result.success) {
        router.push(`/bookings/${result.data.bookingId}`)
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(null)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this draft quote? This cannot be undone.')) return
    setLoading('delete')
    setError(null)
    try {
      const result = await deleteQuote(quote.id)
      if (result.success) {
        router.push('/quotes')
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(null)
    }
  }

  const { status } = quote

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* DRAFT → edit, mark as sent, delete */}
      {status === 'draft' && (
        <>
          <Link href={`/quotes/${quote.id}/edit`}>
            <Button variant="outline" size="sm">
              Edit Draft
            </Button>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            loading={loading === 'sent'}
            onClick={() =>
              handleAction(() => updateQuoteStatus(quote.id, 'sent'), 'sent')
            }
          >
            Mark as Sent
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={loading === 'delete'}
            onClick={handleDelete}
          >
            Delete Draft
          </Button>
        </>
      )}

      {/* SENT → edit, confirm, or cancel */}
      {status === 'sent' && (
        <>
          <Link href={`/quotes/${quote.id}/edit`}>
            <Button variant="outline" size="sm">
              Edit Quote
            </Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            loading={loading === 'confirmed'}
            onClick={() =>
              handleAction(() => updateQuoteStatus(quote.id, 'confirmed'), 'confirmed')
            }
          >
            Confirm Quote
          </Button>
          <Button
            variant="outline"
            size="sm"
            loading={loading === 'cancelled'}
            onClick={() =>
              handleAction(() => updateQuoteStatus(quote.id, 'cancelled'), 'cancelled')
            }
          >
            Cancel
          </Button>
        </>
      )}

      {/* CONFIRMED + no booking → convert */}
      {status === 'confirmed' && !bookingId && (
        <Button
          variant="primary"
          size="sm"
          loading={loading === 'convert'}
          onClick={handleConvert}
        >
          Convert to Booking
        </Button>
      )}

      {/* CONFIRMED + booking exists → show link */}
      {status === 'confirmed' && bookingId && (
        <Link href={`/bookings/${bookingId}`}>
          <Button variant="outline" size="sm">
            View Booking →
          </Button>
        </Link>
      )}

      {/* Inline error */}
      {error && (
        <span className="text-xs text-red-600 ml-1">{error}</span>
      )}
    </div>
  )
}
