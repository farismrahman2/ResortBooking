'use client'

import { useState } from 'react'
import { Download, Image as ImageIcon, Loader2 } from 'lucide-react'
import { photoUrl } from '@/lib/actions/landscaping'
import { stampedFile } from '@/lib/landscaping/stamp'
import { toast } from '@/lib/toast'

/**
 * Bill / slip files with the requisition number stamped across them:
 * "View" opens the stamped copy, the download button saves it
 * (e.g. Req-00053-bill.jpg). The stored original stays as it was.
 */
export function StampedPhotos({ paths, reqNo, label = 'Bill', kind = 'bill', empty }: {
  paths: Array<string | null | undefined>; reqNo: number; label?: string; kind?: string; empty?: React.ReactNode
}) {
  const list = paths.filter(Boolean) as string[]
  if (!list.length) return <>{empty ?? null}</>
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      {list.map((p, i) => <One key={p} path={p} reqNo={reqNo} kind={list.length > 1 ? `${kind}-${i + 1}` : kind}
        label={list.length > 1 ? (i === 0 ? `${label} 1` : String(i + 1)) : label} />)}
    </span>
  )
}

function One({ path, reqNo, label, kind }: { path: string; reqNo: number; label: string; kind: string }) {
  const [busy, setBusy] = useState<'view' | 'save' | null>(null)

  async function make() {
    const url = await photoUrl(path).catch(() => null)
    if (!url) throw new Error('Could not open the file')
    return stampedFile(url, path, reqNo, kind)
  }

  async function view() {
    // Open the tab first (inside the tap) so phones don't block it as a pop-up.
    const tab = window.open('', '_blank')
    setBusy('view')
    try {
      const { blob } = await make()
      const u = URL.createObjectURL(blob)
      if (tab) tab.location.href = u; else window.location.href = u
      setTimeout(() => URL.revokeObjectURL(u), 60_000)
    } catch (e) {
      tab?.close()
      toast.error(e instanceof Error ? e.message : 'Could not open the file')
    } finally { setBusy(null) }
  }

  async function save() {
    setBusy('save')
    try {
      const { blob, name } = await make()
      const u = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = u; a.download = name
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(u), 60_000)
      toast.success(`Saved ${name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not download the file')
    } finally { setBusy(null) }
  }

  return (
    <span className="inline-flex items-center">
      <button type="button" disabled={!!busy} onClick={view} title={`View with Req No ${reqNo}`}
        className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-1.5 text-xs font-medium text-forest-700 hover:bg-forest-50 hover:underline disabled:opacity-60">
        {busy === 'view' ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />} {label}
      </button>
      <button type="button" disabled={!!busy} onClick={save} aria-label={`Download ${label} with Req No ${reqNo}`} title="Download with Req No"
        className="inline-flex h-10 w-9 items-center justify-center rounded-lg text-forest-700 hover:bg-forest-50 disabled:opacity-60">
        {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      </button>
    </span>
  )
}
