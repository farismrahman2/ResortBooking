'use client'

import { useState } from 'react'
import { Image as ImageIcon, Loader2 } from 'lucide-react'
import { photoUrl } from '@/lib/actions/landscaping'

/** Opens a stored bill photo through a short-lived signed link. */
export function ViewPhoto({ path }: { path: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <button type="button" disabled={busy} className="inline-flex items-center gap-1 text-xs font-medium text-forest-700 hover:underline"
      onClick={async () => { setBusy(true); const url = await photoUrl(path); setBusy(false); if (url) window.open(url, '_blank', 'noopener') }}>
      {busy ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />} Photo
    </button>
  )
}
