import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/auth/permissions'
import { listSuppliers, monthlyPnl, projectsWithFinancials } from '@/lib/queries/landscaping'

export const dynamic = 'force-dynamic'

const csv = (rows: Array<Array<string | number>>) =>
  rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\n')

/** GET /api/landscaping/export?report=monthly|projects|suppliers — landscaping CSVs. */
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
  } else {
    return NextResponse.json({ error: 'Unknown report' }, { status: 400 })
  }
  return new NextResponse('﻿' + body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="landscaping-${report}.csv"`, 'Cache-Control': 'no-store' } })
}
