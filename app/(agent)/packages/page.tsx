import Link from 'next/link'
import { getPackages } from '@/lib/queries/packages'
import { Topbar } from '@/components/layout/Topbar'
import { PackageTable } from '@/components/packages/PackageTable'
import { Card } from '@/components/ui/Card'

export const dynamic = 'force-dynamic'

export default async function PackagesPage() {
  const packages = await getPackages()

  return (
    <div className="flex flex-col">
      <Topbar
        title="Packages"
        action={{ label: 'New Package', href: '/packages/new' }}
      />
      <div className="p-4 sm:p-6 space-y-3">
        <Link href="/settings/room-prices"
          className="flex items-center justify-between rounded-xl border border-forest-200 bg-forest-50 px-4 py-3 text-sm text-forest-800 hover:bg-forest-100">
          <span><b>Room prices grid</b> — set every room&apos;s price on every package in one place</span>
          <span aria-hidden>→</span>
        </Link>
        <Card noPadding>
          <PackageTable packages={packages} />
        </Card>
      </div>
    </div>
  )
}
