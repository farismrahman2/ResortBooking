'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { initializeLeaveBalances } from '@/lib/actions/leaves'

interface Props {
  year: number
}

export function InitializeYearButton({ year }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  function run() {
    setMsg(null)
    startTransition(async () => {
      const r = await initializeLeaveBalances(year)
      if (!r.success) { setMsg(r.error); return }
      setMsg(`Created ${r.data.created}, skipped ${r.data.skipped} existing.`)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="primary" size="md" loading={pending} onClick={run}>
        Initialize Year {year}
      </Button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </div>
  )
}
