'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/Button'

/** Manual print trigger — Chrome's print-to-PDF is the PDF deliverable. */
export function PrintButton() {
  return (
    <Button variant="primary" size="sm" onClick={() => window.print()} className="gap-1.5">
      <Printer size={14} />
      Print / Save as PDF
    </Button>
  )
}
