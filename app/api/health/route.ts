import { NextResponse } from 'next/server'

/**
 * Tiny health-check endpoint kept on the Node runtime so the
 * primary Vercel function stays warm. Pinged by the GitHub Actions
 * cron in .github/workflows/keepwarm.yml every 5 min during BD
 * business hours. No auth; returns minimal JSON.
 */
export const runtime  = 'nodejs'
export const dynamic  = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() })
}
