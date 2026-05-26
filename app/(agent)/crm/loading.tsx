export default function Loading() {
  return (
    <div className="p-6">
      <div className="h-7 w-44 animate-pulse rounded bg-gray-200" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}
      </div>
      <div className="mt-6 h-48 animate-pulse rounded-xl bg-gray-100" />
    </div>
  )
}
