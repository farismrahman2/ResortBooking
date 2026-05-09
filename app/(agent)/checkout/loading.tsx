import { Topbar } from '@/components/layout/Topbar'

export default function CheckoutListLoading() {
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Checkout" subtitle="Loading…" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        <div className="h-10 animate-pulse rounded-xl border border-gray-200 bg-gray-100" />
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse border-b border-gray-100 bg-gray-50/40" />
          ))}
        </div>
      </div>
    </div>
  )
}
