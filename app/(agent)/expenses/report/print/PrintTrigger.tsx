'use client'

import { useEffect } from 'react'

/** Auto-opens the browser print dialog when this page loads. */
export function PrintTrigger() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 250)
    return () => clearTimeout(t)
  }, [])
  return null
}
