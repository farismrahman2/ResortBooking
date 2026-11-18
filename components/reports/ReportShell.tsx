import type { ReactNode } from 'react'
import { Topbar } from '@/components/layout/Topbar'
import { PeriodPicker } from './PeriodPicker'
import { ComparisonToggle } from './ComparisonToggle'
import { ExportButtons } from './ExportButtons'
import { toIsoDate } from '@/lib/reports/periods'
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
      <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-6 space-y-5 print:overflow-visible print:p-0">
        {/* Dates stay pinned at the top while the report scrolls. */}
        <div className="sticky top-0 z-20 -mx-4 border-b border-gray-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:-mx-6 sm:px-6 print:hidden">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <PeriodPicker current={preset} customFrom={customFrom} customTo={customTo} from={toIsoDate(period.from)} to={toIsoDate(period.to)} />
            <div className="flex flex-wrap items-center gap-2">
              <ComparisonToggle current={mode} />
              {toolbar}
              {exportReportId && <ExportButtons reportId={exportReportId} />}
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
