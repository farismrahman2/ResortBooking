import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/auth/permissions'
import { itemPriceHistory, listSuppliers, monthlyPnl, projectsWithFinancials, spendAnalysis } from '@/lib/queries/landscaping'

export const dynamic = 'force-dynamic'

const csv = (rows: Array<Array<string | number>>) =>
  rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\n')

/** GET /api/landscaping/export?report=monthly|projects|suppliers|categories|requesters|prices — landscaping CSVs. */
export async function GET(req: NextRequest) {
  if (!(await hasPermission('landscaping', 'read'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const report = req.nextUrl.searchParams.get('report')
  let body = ''
  if (report === 'monthly') {
    const m = await monthlyPnl()
    body = csv([['Month', 'Client payments', 'Supplier bills paid', 'Labour', 'Food', 'Other', 'Money out', 'Net'], ...m.map((x) => [x.month, x.moneyIn, x.bills, x.labour, x.food, x.other, x.moneyOut, x.net])])
  } else if (report === 'projects') {
    const p = await projectsWithFinancials()
    // Main projects include their sub-projects; sub-project rows show their own figures against their budget.
    body = csv([['Project', 'Part of', 'Title', 'Client', 'Status', 'Contract / budget', 'Received', 'Client owes', 'Bills', 'Labour/food/other', 'Spent', 'Profit / left of budget', 'Margin / budget used %'],
      ...p.map((x) => x.parent_id
        ? [x.code, x.parent_code ?? '', x.title, '', x.status, x.budget?.budget ?? 0, x.ownF.received, '', x.ownF.billed, x.ownF.expenses, x.ownF.spent, x.budget?.remaining ?? '', x.budget?.usedPct ?? '']
        : [x.code, '', x.title, x.client_name ?? '', x.status, x.f.contractTotal, x.f.received, x.f.owedByClient, x.f.billed, x.f.expenses, x.f.spent, x.f.profit, x.f.margin ?? ''])])
  } else if (report === 'suppliers') {
    const s = await listSuppliers()
    body = csv([['Supplier', 'Opening dues', 'Billed', 'Paid', 'Owed'], ...s.map((x) => [x.name, x.opening, x.billed, x.paid, x.owed])])
  } else if (report === 'categories') {
    const a = await spendAnalysis()
    body = csv([['Project', 'Work category', 'Spent (bills + labour/food/other)', 'Share %'],
      ...a.byProject.flatMap((p) => p.rows.map((r) => [p.project, r.key, r.amount, r.pct])),
      ...a.overall.map((r) => ['ALL PROJECTS', r.key, r.amount, r.pct])])
  } else if (report === 'requesters') {
    const a = await spendAnalysis()
    body = csv([['Requested by', 'Approved requisitions', 'Approved total', 'Billed so far'], ...a.byRequester.map((r) => [r.name, r.count, r.approved, r.billed])])
  } else if (report === 'prices') {
    const h = await itemPriceHistory()
    body = csv([['Item', 'Unit', 'Date', 'Req. No.', 'Project', 'Rate', 'Suppliers billed'],
      ...h.flatMap((i) => i.lines.map((l) => [i.item, l.unit ?? '', l.date, l.req_no ? String(l.req_no).padStart(5, '0') : '', l.project ?? '', l.unit_price, (l.suppliers ?? []).join('; ')]))])
  } else {
    return NextResponse.json({ error: 'Unknown report' }, { status: 400 })
  }
  return new NextResponse('﻿' + body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="landscaping-${report}.csv"`, 'Cache-Control': 'no-store' } })
}
