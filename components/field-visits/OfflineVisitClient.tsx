'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, CloudOff, PencilLine, ChevronRight, Trash2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { OfflineSync } from './OfflineSync'
import { OfflineWizard } from './OfflineWizard'
import {
  listVisits, putVisit, deleteVisit, newLocalId, storageHeadroom,
  type QueuedVisit,
} from '@/lib/field-visits/offline-store'
import type { CrmSector } from '@/lib/supabase/types-crm'
import type { SalesEmployee } from '@/lib/supabase/types'
import type { FieldVisitBand } from '@/lib/supabase/types-field-visits'

const REF_KEY = 'fv:refdata:v1'

interface RefData {
  sectors:       CrmSector[]
  employees:     SalesEmployee[]
  employeeBands: FieldVisitBand[]
  budgetBands:   FieldVisitBand[]
}

/**
 * Offline-capable field-visit capture.
 *
 * Kept as a separate route from the online wizard on purpose: the online path
 * is server-rendered, proven and in daily use, and retrofitting it to survive
 * having no server would have risked breaking the case that already works.
 * This shell is fully client-side and reads/writes IndexedDB only.
 */
export function OfflineVisitClient(props: RefData) {
  const [ref, setRef]         = useState<RefData>(props)
  const [visits, setVisits]   = useState<QueuedVisit[]>([])
  const [editing, setEditing] = useState<QueuedVisit | null>(null)
  const [tight, setTight]     = useState(false)

  // Mirror reference data so the form still has sectors/staff with no network.
  useEffect(() => {
    const hasServerData = props.sectors.length > 0 || props.employees.length > 0
    if (hasServerData) {
      try { localStorage.setItem(REF_KEY, JSON.stringify(props)) } catch { /* quota */ }
      setRef(props)
      return
    }
    try {
      const raw = localStorage.getItem(REF_KEY)
      if (raw) setRef(JSON.parse(raw) as RefData)
    } catch { /* corrupt mirror — fall through with empty lists */ }
  }, [props])

  const reload = async () => setVisits(await listVisits())
  useEffect(() => { void reload() }, [])
  useEffect(() => {
    void storageHeadroom().then((h) => setTight(!!h?.tight))
  }, [visits])

  async function startNew() {
    const v: QueuedVisit = {
      localId: newLocalId(), status: 'draft', payload: {}, submitted: false,
      gps: null, createdAt: Date.now(), updatedAt: Date.now(), attempts: 0, lastError: null,
    }
    await putVisit(v)
    await reload()
    setEditing(v)
  }

  async function discard(v: QueuedVisit) {
    await deleteVisit(v.localId)
    await reload()
    toast.success('Local visit discarded')
  }

  if (editing) {
    return (
      <OfflineWizard
        visit={editing}
        {...ref}
        onClose={async () => { setEditing(null); await reload() }}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-5 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/crm/field-visits" aria-label="Back"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-gray-600 active:bg-gray-100">
          <ChevronLeft size={22} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-gray-900">Offline visits</h1>
          <p className="text-xs text-gray-500">Works with no signal — uploads when you reconnect</p>
        </div>
      </div>

      <OfflineSync />

      {tight && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Storage on this device is nearly full. Sync soon so queued photos aren&apos;t lost.
        </p>
      )}

      <button
        type="button"
        onClick={startNew}
        className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-amber-600 text-base font-semibold text-white active:bg-amber-700"
      >
        <Plus size={18} /> Log a visit offline
      </button>

      {visits.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-forest-50">
            <CloudOff size={22} className="text-forest-600" />
          </div>
          <p className="mt-3 text-sm font-semibold text-gray-800">Nothing stored on this device</p>
          <p className="mt-1 text-xs text-gray-500">
            Visits you log here stay on the phone until you have signal.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {visits.map((v) => {
            const org = (v.payload as { organisation_name?: string })?.organisation_name
            return (
              <li key={v.localId} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setEditing(v)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-500">
                    <PencilLine size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">
                      {org || 'Untitled visit'}
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      {v.status === 'pending' ? 'Waiting to upload'
                        : v.status === 'failed' ? `Retry pending${v.lastError ? ` — ${v.lastError}` : ''}`
                        : 'Draft on this device'}
                    </span>
                  </span>
                  <ChevronRight size={15} className="flex-shrink-0 text-gray-300" />
                </button>
                <button
                  type="button"
                  onClick={() => discard(v)}
                  aria-label="Discard"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-red-500 active:bg-red-50"
                >
                  <Trash2 size={15} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
