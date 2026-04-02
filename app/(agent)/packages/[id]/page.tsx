import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getPackageById } from '@/lib/queries/packages'
import { getRoomInventory } from '@/lib/queries/settings'
import { Topbar } from '@/components/layout/Topbar'
import { PackageForm } from '@/components/packages/PackageForm'
import { Card } from '@/components/ui/Card'

export const dynamic = 'force-dynamic'

interface PackageEditPageProps {
  params: { id: string }
}

export default async function PackageEditPage({ params }: PackageEditPageProps) {
  const [pkg, inventory] = await Promise.all([
    getPackageById(params.id),
    getRoomInventory(),
  ])

  if (!pkg) {
    notFound()
  }

  return (
    <div className="flex flex-col">
      <Topbar title={pkg.name} />
      <div className="p-6 max-w-4xl mx-auto w-full">
        <Link
          href="/packages"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ChevronLeft size={16} />
          Back to Packages
        </Link>
        <Card>
          <PackageForm mode="edit" package={pkg} inventory={inventory} />
        </Card>
      </div>
    </div>
  )
}
