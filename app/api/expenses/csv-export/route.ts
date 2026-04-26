import { NextRequest, NextResponse } from 'next/server'
import { getExpenses } from '@/lib/queries/expenses'

/**
 * GET /api/expenses/csv-export?from=&to=&categoryId=&payeeId=
 *
 * Streams a CSV download of every matching expense. Excludes drafts.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to required' }, { status: 400 })
  }

  try {
    // Pull all rows in the range (no pagination — CSV needs the full set)
    const { rows } = await getExpenses({
      from,
      to,
      categoryId:    searchParams.get('categoryId')    ?? undefined,
      payeeId:       searchParams.get('payeeId')       ?? undefined,
      paymentMethod: searchParams.get('paymentMethod') ?? undefined,
      includeDrafts: false,
      limit:         100000,
    })

    const header = [
      'Date', 'Category', 'Category Group', 'Payee', 'Description',
      'Amount (BDT)', 'Payment Method', 'Reference', 'Notes',
    ]

    const escapeCell = (v: unknown): string => {
      if (v === null || v === undefined) return ''
      const s = String(v)
      // Escape per RFC 4180 — wrap in quotes, double internal quotes
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
      return s
    }

    const lines: string[] = [header.join(',')]
    for (const r of rows) {
      lines.push([
        r.expense_date,
        r.category.name,
        r.category.category_group,
        r.payee?.name ?? '',
        r.description ?? '',
        Number(r.amount).toFixed(2),
        r.payment_method,
        r.reference_number ?? '',
        r.notes ?? '',
      ].map(escapeCell).join(','))
    }

    const csv = lines.join('\r\n')
    const filename = `expenses-${from}-to-${to}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type':        'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
      },
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
