'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export function UsersFilterBar({ showInactive }: { showInactive: boolean }) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  function update(value: boolean) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('showInactive', '1')
    else       params.delete('showInactive')
    router.replace(`/settings/users?${params.toString()}`)
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-slate-700 focus:ring-slate-400"
          checked={showInactive}
          onChange={(e) => update(e.target.checked)}
        />
        Show deactivated users
      </label>
    </div>
  )
}
