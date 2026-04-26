import { NextRequest, NextResponse } from 'next/server'
import { getExpenseAttachments, getSignedAttachmentUrl } from '@/lib/queries/expenses'

/**
 * GET /api/expenses/[id]/attachments
 *
 * Returns the list of attachments for an expense, each with a fresh
 * short-lived signed URL the browser can use to display/download the
 * private-bucket file.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const attachments = await getExpenseAttachments(params.id)
    const items = await Promise.all(
      attachments.map(async (a) => {
        let url: string | null = null
        try {
          url = await getSignedAttachmentUrl(a.storage_path)
        } catch {
          url = null
        }
        return { ...a, url }
      }),
    )
    return NextResponse.json({ rows: items })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
