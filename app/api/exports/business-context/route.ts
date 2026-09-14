import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/auth/permissions'
import { buildBusinessContext, type ExportDetail } from '@/lib/queries/exports/business-context'
import { todayDhaka } from '@/lib/dates'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/exports/business-context?from=&to=&detail=full|summary[&download=1]
 *
 * The whole business as one JSON document, for pasting into an AI chat.
 * Financial data end to end, so it needs the reports permission — the same
 * bar as the money reports it summarises.
 */
export async function GET(req: NextRequest) {
  if (!(await hasPermission('reports', 'read'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const q      = req.nextUrl.searchParams
  const from   = ISO.test(q.get('from') ?? '') ? q.get('from')! : '2000-01-01'
  const to     = ISO.test(q.get('to')   ?? '') ? q.get('to')!   : '2100-12-31'
  const detail: ExportDetail = q.get('detail') === 'summary' ? 'summary' : 'full'

  try {
    const pack = await buildBusinessContext({ from, to, detail })
    const body = JSON.stringify(pack, null, 2)
    const filename = `garden-centre-business-context-${todayDhaka()}.json`
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type':  'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...(q.get('download')
          ? { 'Content-Disposition': `attachment; filename="${filename}"` }
          : {}),
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
