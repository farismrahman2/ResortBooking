import { Topbar } from '@/components/layout/Topbar'

interface Props {
  title?:    string
  subtitle?: string
  /** Skeleton shape variant. Defaults to a list-style layout. */
  variant?:  'list' | 'detail' | 'dashboard' | 'plain'
}

/** Shared route-level skeleton. Every (agent) route loading.tsx defaults
 *  to this so navigation never shows a blank screen. Variants tweak the
 *  shape so the loading state roughly matches the destination layout. */
export function RouteSkeleton({ title, subtitle, variant = 'list' }: Props) {
  return (
    <div className="flex h-full flex-col">
      <Topbar title={title ?? 'Loading…'} subtitle={subtitle} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-4">
        {variant === 'detail' ? (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            <div className="space-y-3">
              <Box h="h-40" />
              <Box h="h-64" />
              <Box h="h-32" />
            </div>
            <div className="space-y-3">
              <Box h="h-44" />
              <Box h="h-12" />
              <Box h="h-12" />
            </div>
          </div>
        ) : variant === 'dashboard' ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => <Box key={i} h="h-24" />)}
            </div>
            <Box h="h-64" />
            <Box h="h-48" />
          </>
        ) : variant === 'plain' ? (
          <Box h="h-96" />
        ) : (
          <>
            <Box h="h-10" />
            {/* Content-shaped rows rather than plain bars — the eye reads the
                incoming layout instead of a grey slab. */}
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-0">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Bar w={i % 3 === 0 ? 'w-40' : i % 3 === 1 ? 'w-52' : 'w-32'} />
                    <Bar w="w-24" h="h-2" />
                  </div>
                  <Bar w="w-16" />
                  <Bar w="w-14" className="hidden sm:block" />
                  <div className="h-5 w-16 flex-shrink-0 animate-pulse rounded-full bg-gray-100" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Box({ h }: { h: string }) {
  return <div className={`${h} animate-pulse rounded-xl border border-gray-200 bg-gray-100`} />
}

function Bar({ w, h = 'h-3', className = '' }: { w: string; h?: string; className?: string }) {
  return <div className={`${w} ${h} animate-pulse rounded bg-gray-100 ${className}`} />
}
