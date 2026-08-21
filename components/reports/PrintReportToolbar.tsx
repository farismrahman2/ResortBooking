'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Printer, RefreshCw } from 'lucide-react'

export interface PrintSectionOption { id: string; label: string; enabled: boolean }

/**
 * Screen-only controls for the master PDF report: date range, which sections
 * to include, and the print button. Chrome's "Save as PDF" in the print
 * dialog is the download — same pattern as the requisition sheet.
 */
export function PrintReportToolbar({
  from, to, sections,
}: {
  from: string
  to: string
  sections: PrintSectionOption[]
}) {
  const router = useRouter()
  const [f, setF] = useState(from)
  const [t, setT] = useState(to)
  const [on, setOn] = useState<Set<string>>(new Set(sections.filter((s) => s.enabled).map((s) => s.id)))

  function apply() {
    const chosen = sections.filter((s) => on.has(s.id)).map((s) => s.id)
    const qs = new URLSearchParams({ from: f, to: t })
    if (chosen.length && chosen.length < sections.length) qs.set('sections', chosen.join(','))
    router.push(`/reports/print?${qs.toString()}`)
  }

  return (
    <div className="no-print space-y-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ChevronLeft size={15} /> Reports
        </Link>
        <span className="text-gray-300">|</span>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          From
          <input type="date" value={f} onChange={(e) => setF(e.target.value)}
            className="min-h-[38px] rounded-lg border border-gray-300 px-2 text-sm" />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          to
          <input type="date" value={t} onChange={(e) => setT(e.target.value)}
            className="min-h-[38px] rounded-lg border border-gray-300 px-2 text-sm" />
        </label>
        <button type="button" onClick={apply}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-xs font-medium text-gray-700">
          <RefreshCw size={13} /> Update
        </button>
        <button type="button" onClick={() => window.print()}
          className="ml-auto inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-forest-700 px-4 text-xs font-semibold text-white">
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {sections.map((s) => (
          <label key={s.id} className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={on.has(s.id)}
              onChange={(e) => {
                setOn((prev) => {
                  const next = new Set(prev)
                  e.target.checked ? next.add(s.id) : next.delete(s.id)
                  return next
                })
              }}
              className="h-3.5 w-3.5 rounded border-gray-300 accent-forest-700"
            />
            {s.label}
          </label>
        ))}
        <span className="text-[11px] text-gray-400">— tick the sections you want, then Update</span>
      </div>
    </div>
  )
}
