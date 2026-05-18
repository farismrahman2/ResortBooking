import type { ReactNode } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { PeriodPicker } from './PeriodPicker'
import { ComparisonToggle } from './ComparisonToggle'
import { ExportButtons } from './ExportButtons'
import type { ComparisonMode, PeriodPreset, PeriodRange } from '@/lib/reports/types'

interface Props {
  title:    string
  subtitle: string
  period:   PeriodRange
  preset:   PeriodPreset
  customFrom?: string
  customTo?:   string
  mode:     ComparisonMode
  /** Report id for the export route. Omit on the hub. */
  exportReportId?: string
  /** Optional toolbar slot for export buttons. */
  toolbar?: ReactNode
  children: ReactNode
}

/**
 * Standard chrome wrapped around every report page: title bar, period
 * picker, comparison toggle, optional export toolbar, and the report body.
 */
export function ReportShell({
  title, subtitle, period, preset, customFrom, customTo, mode, exportReportId, toolbar, children,
}: Props) {
  return (
    <div className="flex h-full flex-col">
      <Topbar title={title} subtitle={`${subtitle} · ${period.label}`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5 print:overflow-visible print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white p-3 print:hidden">
          <div className="flex flex-wrap items-center gap-3">
            <PeriodPicker current={preset} customFrom={customFrom} customTo={customTo} />
            <ComparisonToggle current={mode} />
          </div>
          <div className="flex items-center gap-2">
            {toolbar}
            {exportReportId && <ExportButtons reportId={exportReportId} />}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
