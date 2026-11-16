'use client'

import { useState } from 'react'
import { Image as ImageIcon, Loader2 } from 'lucide-react'
import { photoUrl } from '@/lib/actions/landscaping'
import { toast } from '@/lib/toast'

/** Opens a stored bill photo through a short-lived signed link. */
export function ViewPhoto({ path }: { path: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button type="button" disabled={busy} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg px-1.5 text-xs font-medium text-forest-700 hover:bg-forest-50 hover:underline disabled:opacity-60"
      onClick={async () => {
        setBusy(true)
        const url = await photoUrl(path).catch(() => null)
        setBusy(false)
        if (url) window.open(url, '_blank', 'noopener'); else toast.error('Could not open the photo. Try again.')
      }}>
      {busy ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />} {busy ? 'Opening…' : 'Photo'}
    </button>
  )
}
