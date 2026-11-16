import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { hasPermission } from '@/lib/auth/permissions'
import { getRequisition } from '@/lib/queries/landscaping'
import { getSettings } from '@/lib/queries/settings'
import { formatReqNo } from '@/lib/landscaping/money'
import { LsRequisitionPdf } from '@/lib/pdf/ls-requisition'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/landscaping/requisitions/[id]/pdf — the printable requisition slip. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await hasPermission('landscaping', 'read'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const [data, settings] = await Promise.all([getRequisition(params.id), getSettings()])
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { req, items, names } = data
  const reqNo = formatReqNo(req.req_no)
  const buffer = await renderToBuffer(LsRequisitionPdf({
    businessName: settings.landscaping_business_name ?? 'Garden Centre',
    // A sub-project's slip carries its main project's name (ASU) and names the sub-project (Parking).
    projectCode: req.project?.parent?.code ?? req.project?.code ?? null, reqNo, date: req.req_date, department: req.department,
    description: req.description, requestedBy: req.requested_by_name,
    projectLabel: req.project
      ? [req.project.parent ? `${req.project.parent.code} › ${req.project.code}` : null, req.project.title, req.project.site].filter(Boolean).join(' · ')
      : null,
    area: req.area_note, items, total: req.total, remarks: req.remarks, status: req.status,
    // A slip entered from paper shows the names written on the paper.
    ...(req.from_paper
      ? { prepared: { name: req.paper_prepared_by, at: null }, checked: { name: req.paper_checked_by, at: null }, approved: { name: req.paper_approved_by, at: null }, fromPaper: true }
      // Names picked on the form go on the lines; the app's own record (who pressed the button, when) is the small stamp.
      : {
          prepared: { name: req.paper_prepared_by ?? names.prepared, by: names.prepared, at: req.submitted_at },
          checked:  { name: req.paper_checked_by ?? names.checked, by: names.checked, at: req.checked_at },
          approved: { name: req.paper_approved_by ?? names.approved, by: names.approved, at: req.approved_at },
        }),
  }))
  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="Requisition-${reqNo}.pdf"`,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  })
}
