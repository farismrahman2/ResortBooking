import { NextResponse } from 'next/server'
import { getCurrentUserContext } from '@/lib/auth/permissions'
import { getExpensesForExport } from '@/lib/queries/data-export'
import { toCsv } from '@/lib/data-export/csv'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const ctx = await getCurrentUserContext()
  if (!ctx) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  if (ctx.profile.role.slug !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const url = new URL(req.url)
  const from = url.searchParams.get('from') ?? ''
  const to   = url.searchParams.get('to')   ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from and to must be YYYY-MM-DD' }, { status: 400 })
  }

  try {
    const rows = await getExpensesForExport({ from, to })
    const csv = rows.length === 0
      ? 'expense_date,category_slug,category_group,payee_name,payee_type,amount,payment_method,source_module,reference,notes\r\n'
      : toCsv(rows)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="expenses_${from}_to_${to}.csv"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
