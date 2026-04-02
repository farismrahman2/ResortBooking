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
      <div className="p-4 sm:p-6">
        <Card noPadding>
          <PackageTable packages={packages} />
        </Card>
      </div>
    </div>
  )
}
