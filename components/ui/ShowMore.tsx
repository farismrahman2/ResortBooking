'use client'

import { useEffect, useState } from 'react'

/** Rows drawn per step. A phone drawing 1000 table rows at once is what made
 *  the long lists slow to open and to filter. */
export const PAGE_ROWS = 50

/**
 * How many rows of a filtered list to draw, reset to one page whenever the
 * filters change (`resetKey`). Pair with <ShowMoreButton>.
 */
export function useShownRows(total: number, resetKey: string) {
  const [shown, setShown] = useState(PAGE_ROWS)
  useEffect(() => { setShown(PAGE_ROWS) }, [resetKey])
  return {
    shown: Math.min(shown, total),
    more:  () => setShown((n) => n + PAGE_ROWS * 2),
    all:   () => setShown(total),
  }
}

export function ShowMoreButton({ shown, total, onMore, onAll }: {
  shown: number; total: number; onMore: () => void; onAll: () => void
}) {
  if (shown >= total) return null
  return (
    <div className="flex items-center justify-center gap-3 py-3 text-sm">
      <span className="text-gray-500">Showing {shown} of {total}</span>
      <button type="button" onClick={onMore}
        className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">
        Show more
      </button>
      <button type="button" onClick={onAll} className="text-xs text-gray-500 underline hover:text-gray-700">
        Show all
      </button>
    </div>
  )
}
