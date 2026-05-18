import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getCoffeeShopSaleById } from '@/lib/queries/coffee-shop'
import { listChargeCategories, listChargeItems } from '@/lib/queries/charge-catalog'
import { isStillSameDayInDhaka } from '@/lib/coffee-shop/timezone'
import { CoffeeShopSaleForm } from '@/components/coffee-shop/CoffeeShopSaleForm'

export const dynamic = 'force-dynamic'

interface PageProps { params: { id: string } }

export default async function EditCoffeeShopSalePage({ params }: PageProps) {
  await requirePermission('coffee_shop', 'write')
  const sale = await getCoffeeShopSaleById(params.id)
  if (!sale) notFound()
  if (sale.status !== 'completed' || !isStillSameDayInDhaka(sale.sale_date)) {
    redirect(`/coffee-shop/sales/${params.id}`)
  }
  const [categories, items] = await Promise.all([
    listChargeCategories({ includeInactive: false }),
    listChargeItems({ includeInactive: false }),
  ])

  return (
    <div className="flex h-full flex-col">
      <Topbar title={`Edit ${sale.sale_number}`} subtitle="Same-day edits only" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        <Link href={`/coffee-shop/sales/${sale.id}`} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-stone-700">
          <ArrowLeft size={14} /> Back to sale
        </Link>
        <CoffeeShopSaleForm categories={categories} items={items} initial={sale} saleId={sale.id} />
      </div>
    </div>
  )
}
