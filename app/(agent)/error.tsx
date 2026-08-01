'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'

/**
 * There was no error boundary anywhere in app/ — a runtime error showed the
 * raw Next.js overlay in dev and a blank screen in production.
 */
export default function AgentError({
  error, reset,
}: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[agent] unhandled error:', error)
  }, [error])

  // A missing table/column almost always means a migration hasn't been run —
  // by far the most common failure in this app, so name it explicitly.
  const looksLikeMigration = /relation .* does not exist|column .* does not exist|schema cache/i
    .test(error.message)

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle size={26} className="text-red-600" />
        </div>
        <h1 className="mt-3 text-lg font-bold text-gray-900">Something went wrong</h1>

        {looksLikeMigration ? (
          <p className="mt-1.5 text-sm text-gray-600">
            This usually means a database migration hasn&apos;t been run yet for this module.
            Check the <code className="rounded bg-gray-100 px-1 text-xs">migrations/</code> folder.
          </p>
        ) : (
          <p className="mt-1.5 text-sm text-gray-600">
            The page hit an unexpected error. Trying again often clears it.
          </p>
        )}

        <details className="mt-3 text-left">
          <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700">
            Error detail
          </summary>
          <pre className="mt-1.5 max-h-40 overflow-auto rounded-lg bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-700">
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
        </details>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-forest-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-forest-800"
          >
            <RotateCcw size={15} /> Try again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Home size={15} /> Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
