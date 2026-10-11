'use client'

import { useEffect, useState } from 'react'
import { CloudOff, RotateCcw } from 'lucide-react'

/**
 * Shown when the database can't be reached. Checks /api/health every 15
 * seconds and goes back to where the person was as soon as it answers —
 * no sign-out, no "Access denied", nothing to do but wait.
 */
export function UnavailableClient({ next }: { next: string }) {
  const [checking, setChecking] = useState(false)
  const [tries, setTries] = useState(0)

  async function check() {
    setChecking(true)
    try {
      const r = await fetch('/api/health', { cache: 'no-store' })
      if (r.ok) { window.location.replace(next); return }
    } catch { /* still down */ }
    setChecking(false)
    setTries((t) => t + 1)
  }

  useEffect(() => {
    const id = setInterval(check, 15000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
          <CloudOff size={26} className="text-amber-600" />
        </div>
        <h1 className="mt-3 text-lg font-bold text-gray-900">Can&apos;t reach the database right now</h1>
        <p className="mt-1.5 text-sm text-gray-600">
          Your bookings and data are safe. The system is checking every 15 seconds and will
          take you back automatically as soon as the connection returns.
        </p>
        {tries > 0 && <p className="mt-2 text-xs text-gray-400">Checked {tries} time{tries === 1 ? '' : 's'} — still waiting.</p>}
        <button type="button" onClick={check} disabled={checking}
          className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-forest-700 px-5 text-sm font-semibold text-white hover:bg-forest-800 disabled:opacity-60">
          <RotateCcw size={15} className={checking ? 'animate-spin' : ''} /> {checking ? 'Checking…' : 'Try now'}
        </button>
        <p className="mt-4 text-[11px] text-gray-400">If this lasts more than 10 minutes, tell an admin — the database may need a restart in Supabase.</p>
      </div>
    </div>
  )
}
