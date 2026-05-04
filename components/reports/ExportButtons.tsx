'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Download, FileText, FileSpreadsheet, FileImage, Printer } from 'lucide-react'

interface Props {
  reportId: string
}

export function ExportButtons({ reportId }: Props) {
  const params = useSearchParams()
  const [open, setOpen] = useState(false)

  function url(format: 'csv' | 'xlsx' | 'pdf'): string {
    const sp = new URLSearchParams(params.toString())
    sp.set('format', format)
    return `/api/reports/${reportId}/export?${sp.toString()}`
  }

  function printUrl(): string {
    const sp = new URLSearchParams(params.toString())
    sp.set('print', '1')
    return `?${sp.toString()}`
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Download size={14} /> Export
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <a href={url('csv')}  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50">
            <FileText size={14} /> CSV
          </a>
          <a href={url('xlsx')} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50">
            <FileSpreadsheet size={14} /> Excel
          </a>
          <a href={url('pdf')} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50">
            <FileImage size={14} /> PDF
          </a>
          <a href={printUrl()} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50">
            <Printer size={14} /> Print view
          </a>
        </div>
      )}
    </div>
  )
}
