import { requireRealRevenue } from '@/lib/auth/permissions'

/** Money totals — the super admin only (lib/revenue/display.ts). */
export default async function RealRevenueLayout({ children }: { children: React.ReactNode }) {
  await requireRealRevenue()
  return <>{children}</>
}
