import { Topbar } from '@/components/layout/Topbar'

/** Skeleton shown while /checkout/[bookingId] data loads. Replaces the
 *  blank-screen wait that made every click feel slow. */
export default function CheckoutDetailLoading() {
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Checkout" subtitle="Loading…" />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Box h="h-40" />
            <Box h="h-64" />
            <Box h="h-32" />
          </div>
          <div className="space-y-3">
            <Box h="h-44" />
            <Box h="h-12" />
            <Box h="h-12" />
            <Box h="h-12" />
          </div>
        </div>
      </div>
    </div>
  )
}

function Box({ h }: { h: string }) {
  return <div className={`${h} animate-pulse rounded-xl border border-gray-200 bg-gray-100`} />
}
