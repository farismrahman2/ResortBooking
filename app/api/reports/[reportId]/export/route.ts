import { NextRequest, NextResponse } from 'next/server'
import { renderToStream } from '@react-pdf/renderer'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { resolvePeriod } from '@/lib/reports/page-params'
import { getReportBuilder } from '@/lib/reports/registry'
import { payloadToCsv } from '@/lib/reports/export/csv'
import { payloadToXlsx } from '@/lib/reports/export/xlsx'
import { ReportPdfDocument } from '@/lib/reports/export/pdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface RouteParams { params: { reportId: string } }

function safeFilename(reportId: string, period: string, ext: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
  const periodSlug = period.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)
  return `${reportId}_${periodSlug}_${stamp}.${ext}`
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  await requirePermission('reports', 'read')

  const sp = req.nextUrl.searchParams
  const format = (sp.get('format') ?? 'csv').toLowerCase()
  const builder = getReportBuilder(params.reportId)
  if (!builder) return NextResponse.json({ error: 'Unknown report id' }, { status: 404 })

  const { period } = resolvePeriod({
    period: sp.get('period') ?? undefined,
    from:   sp.get('from')   ?? undefined,
    to:     sp.get('to')     ?? undefined,
    compare: sp.get('compare') ?? undefined,
  })
  const ctx = await getCurrentUserContext()
  const generatedBy = ctx?.profile.full_name ?? ctx?.email ?? 'System'

  const payload = await builder(period, generatedBy)

  if (format === 'csv') {
    const csv = payloadToCsv(payload)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFilename(params.reportId, period.label, 'csv')}"`,
      },
    })
  }

  if (format === 'xlsx') {
    const buf = payloadToXlsx(payload)
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeFilename(params.reportId, period.label, 'xlsx')}"`,
      },
    })
  }

  if (format === 'pdf') {
    const stream = await renderToStream(ReportPdfDocument({ payload }))
    const chunks: Buffer[] = []
    for await (const chunk of stream as any) {  // eslint-disable-line @typescript-eslint/no-explicit-any
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    const buf = Buffer.concat(chunks)
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${safeFilename(params.reportId, period.label, 'pdf')}"`,
      },
    })
  }

  return NextResponse.json({ error: 'Unsupported format. Use csv, xlsx, or pdf.' }, { status: 400 })
}
