import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getRoomInventory } from '@/lib/queries/settings'
import { Topbar } from '@/components/layout/Topbar'
import { PackageForm } from '@/components/packages/PackageForm'
import { Card } from '@/components/ui/Card'

export const dynamic = 'force-dynamic'

export default async function NewPackagePage() {
  const inventory = await getRoomInventory()

  return (
    <div className="flex flex-col">
      <Topbar title="New Package" />
      <div className="p-6 max-w-4xl mx-auto w-full">
        <Link
          href="/packages"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ChevronLeft size={16} />
          Back to Packages
        </Link>
        <Card>
          <PackageForm mode="create" inventory={inventory} />
        </Card>
      </div>
    </div>
  )
}
