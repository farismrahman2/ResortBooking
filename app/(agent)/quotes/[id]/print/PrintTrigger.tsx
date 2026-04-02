'use client'

import { useEffect } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'

/**
 * Auto-triggers window.print() on mount and exposes a manual print button.
 * Kept as a separate 'use client' component so the parent page stays a
 * server component.
 */
export function PrintTrigger() {
  useEffect(() => {
    // Small delay lets the page fully render before the dialog opens
    const timer = setTimeout(() => window.print(), 400)
    return () => clearTimeout(timer)
  }, [])

  return (
    <Button variant="primary" size="sm" onClick={() => window.print()} className="gap-1.5">
      <Printer size={14} />
      Print
    </Button>
  )
}
