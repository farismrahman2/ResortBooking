import Link from 'next/link'
import { Leaf, Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-forest-700">
          <Leaf size={26} className="text-white" />
        </div>
        <p className="mt-4 text-4xl font-bold tabular-nums text-forest-800">404</p>
        <h1 className="mt-1 text-lg font-semibold text-gray-900">Page not found</h1>
        <p className="mt-1.5 text-sm text-gray-500">
          That page doesn&apos;t exist, or the record was deleted.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-forest-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
          >
            <Home size={15} /> Dashboard
          </Link>
          <Link
            href="/bookings"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft size={15} /> Bookings
          </Link>
        </div>
      </div>
    </div>
  )
}
