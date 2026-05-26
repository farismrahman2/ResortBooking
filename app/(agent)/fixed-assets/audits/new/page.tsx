'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { startAudit } from '@/lib/actions/fixed-assets'

export default function NewAuditPage() {
  const router = useRouter()
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await startAudit(Number(year))
      if (!res.success) { setError(res.error); return }
      router.push(`/fixed-assets/audits/${res.data.id}`)
      router.refresh()
    })
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Start audit" subtitle="Snapshots every active asset for verification" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-md space-y-4">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          <Input label="Audit year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          <p className="text-xs text-gray-500">A line is created for every active asset, with its current location as the expected location.</p>
          <div className="flex gap-2">
            <Button onClick={submit} loading={pending}>Start audit</Button>
            <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
