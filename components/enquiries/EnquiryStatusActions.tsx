'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateEnquiryStatus } from '@/lib/actions/enquiries'
import type { EnquiryStatus } from '@/lib/supabase/types'

const STEPS: Array<{ key: EnquiryStatus; label: string; active: string }> = [
  { key: 'new',       label: 'New',       active: 'bg-blue-600 text-white border-blue-600' },
  { key: 'contacted', label: 'Contacted', active: 'bg-amber-500 text-white border-amber-500' },
  { key: 'won',       label: 'Won',       active: 'bg-green-600 text-white border-green-600' },
  { key: 'lost',      label: 'Lost',      active: 'bg-red-600 text-white border-red-600' },
]

interface Props {
  id: string
  current: EnquiryStatus
  canWrite: boolean
}

export function EnquiryStatusActions({ id, current, canWrite }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function setStatus(status: EnquiryStatus) {
    if (status === current || pending || !canWrite) return
    setError(null)
    startTransition(async () => {
      const res = await updateEnquiryStatus({ id, status })
      if (!res.success) { setError(res.error ?? 'Failed to update'); return }
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {STEPS.map((s) => {
          const isActive = s.key === current
          return (
            <button
              key={s.key}
              type="button"
              disabled={!canWrite || pending}
              onClick={() => setStatus(s.key)}
              className={
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ' +
                (isActive
                  ? s.active
                  : 'border-gray-200 bg-white text-gray-600 enabled:hover:bg-gray-50 disabled:opacity-60')
              }
            >
              {s.label}
            </button>
          )
        })}
      </div>
      {!canWrite && (
        <p className="mt-2 text-xs text-gray-400">You have read-only access to enquiries.</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
