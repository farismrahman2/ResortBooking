'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { markEnquirySeen } from '@/lib/actions/enquiries'

/**
 * Fire-and-forget: marks the lead seen the first time its detail page mounts,
 * clearing it from the sidebar "new enquiries" badge. Refreshes so the badge
 * count updates without a manual reload. No UI.
 */
export function MarkSeen({ id, alreadySeen }: { id: string; alreadySeen: boolean }) {
  const router = useRouter()
  const ran = useRef(false)

  useEffect(() => {
    if (alreadySeen || ran.current) return
    ran.current = true
    markEnquirySeen(id).then((res) => {
      if (res.success) router.refresh()
    })
  }, [id, alreadySeen, router])

  return null
}
