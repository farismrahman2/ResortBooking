import { NextRequest, NextResponse } from 'next/server'
import { hasPermission } from '@/lib/auth/permissions'
import { getGuestFeedbackByPhone } from '@/lib/queries/qa'

/**
 * GET /api/guest-feedback?phone=01XXXXXXXXX
 *
 * Cross-stay QA feedback summary for a guest phone number. Powers the
 * "returning guest" badge on the quote form. Deliberately NOT under a
 * module-gated URL prefix (booking-side roles need it), so the qa:read
 * check happens here instead of in middleware.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const phone = searchParams.get('phone')

  if (!phone) {
    return NextResponse.json({ error: 'phone is required' }, { status: 400 })
  }

  if (!(await hasPermission('qa', 'read'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const summary = await getGuestFeedbackByPhone(phone)
    return NextResponse.json({ summary })
  } catch {
    // qa migration not applied yet — behave as "no history" rather than erroring
    return NextResponse.json({ summary: null })
  }
}
