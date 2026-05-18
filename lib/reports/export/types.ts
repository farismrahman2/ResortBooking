/**
 * Standard report-export payload. Every report builds one of these
 * server-side and feeds it to the CSV/XLSX/PDF renderers. Keeping the
 * shape uniform lets us share the route handler + ExportButtons UI.
 */

export type CellFormat = 'number' | 'currency' | 'percent' | 'date' | 'text'

export interface ExportColumn {
  key:    string
  label:  string
  align?: 'left' | 'right' | 'center'
  format?: CellFormat
}

export interface ExportTable {
  title:   string
  columns: ExportColumn[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows:    Array<Record<string, any>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  totals?: Record<string, any>
}

export interface ExportKpi {
  label:       string
  value:       string
  comparison?: string
}

export interface ReportExportPayload {
  reportId:         string                  // e.g. 'income'
  title:            string                  // "Income overview"
  subtitle:         string                  // human period label
  comparisonLabel?: string                  // "vs Apr 2026"
  generatedAt:      Date
  generatedBy:      string                  // user full name / email
  kpis:             ExportKpi[]
  tables:           ExportTable[]
  notes?:           string[]
}
