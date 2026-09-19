import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { hasPermission } from '@/lib/auth/permissions'
import { getFieldVisitsReport } from '@/lib/queries/reports/field-visits'
import { getSettings } from '@/lib/queries/settings'
import { listSalesEmployees } from '@/lib/queries/employees'
import { loadResortLogo } from '@/lib/pdf/logo'
import { FieldVisitsReportDocument } from '@/lib/pdf/field-visits-report'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/field-visits/report?from=YYYY-MM-DD&to=YYYY-MM-DD[&exec=<employee id>]
 * Streams the field-visit report as a downloadable PDF.
 */
export async function GET(req: NextRequest) {
  if (!(await hasPermission('field_visits', 'read'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const q    = req.nextUrl.searchParams
  const from = q.get('from') ?? ''
  const to   = q.get('to')   ?? ''
  if (!ISO.test(from) || !ISO.test(to) || from > to) {
    return NextResponse.json({ error: 'from and to must be YYYY-MM-DD, from on or before to' }, { status: 400 })
  }
  const exec = q.get('exec') || undefined

  const [report, settings, employees, logo] = await Promise.all([
    getFieldVisitsReport(from, to, { executiveId: exec }),
    getSettings(),
    exec ? listSalesEmployees().catch(() => []) : Promise.resolve([]),
    loadResortLogo(),
  ])

  const buffer = await renderToBuffer(FieldVisitsReportDocument({
    report,
    executiveName: exec ? (employees.find((e) => e.id === exec)?.full_name ?? null) : null,
    resortName:    settings['resort_name']    ?? 'Garden Centre Resort',
    resortAddress: settings['resort_address'] ?? 'Kaliganj, Gazipur, Bangladesh',
    resortPhone:   settings['contact_numbers'] ?? '',
    logo,
    generatedAt:   new Date(),
  }))

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="GCR-field-visits-${from}_${to}.pdf"`,
      'Content-Length':      String(buffer.length),
      'Cache-Control':       'no-store',
    },
  })
}
