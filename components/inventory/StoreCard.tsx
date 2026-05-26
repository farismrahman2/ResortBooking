import Link from 'next/link'
import { Warehouse, ChevronRight } from 'lucide-react'
import type { InvStore } from '@/lib/supabase/types-inventory'

interface Props {
  store:       InvStore
  skuCount:    number
  lowStock:    number
}

export function StoreCard({ store, skuCount, lowStock }: Props) {
  return (
    <Link
      href={`/inventory/${store.slug}`}
      className="group flex items-center justify-between rounded-xl border border-gray-200 bg-white p-5 transition hover:border-teal-400 hover:shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
          <Warehouse size={18} />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">{store.display_name}</h3>
          <p className="mt-0.5 text-xs text-gray-500">{store.description}</p>
          <div className="mt-2 flex items-center gap-3 text-xs">
            <span className="font-medium text-gray-700">{skuCount} SKU{skuCount !== 1 ? 's' : ''}</span>
            {lowStock > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">
                {lowStock} low
              </span>
            )}
          </div>
        </div>
      </div>
      <ChevronRight size={18} className="text-gray-300 group-hover:text-teal-500" />
    </Link>
  )
}
