import { requireRealRevenue } from '@/lib/auth/permissions'

/** Real revenue — the admin only; everyone else sees the dashboard's figure. */
export default async function RealRevenueLayout({ children }: { children: React.ReactNode }) {
  await requireRealRevenue()
  return <>{children}</>
}
