'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface Props {
  mineCount: number
  allCount:  number
  current:   'mine' | 'all'
}

/** Segmented My/All control. Only rendered for corporate_sales (the page decides). */
export function OwnerToggle({ mineCount, allCount, current }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function setView(view: 'mine' | 'all') {
    const next = new URLSearchParams(params.toString())
    next.set('view', view)
    router.replace(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
      <button
        type="button" onClick={() => setView('mine')}
        className={`rounded-md px-3 py-1.5 font-medium ${current === 'mine' ? 'bg-amber-100 text-amber-800' : 'text-gray-600 hover:bg-gray-50'}`}
      >
        My Accounts ({mineCount})
      </button>
      <button
        type="button" onClick={() => setView('all')}
        className={`rounded-md px-3 py-1.5 font-medium ${current === 'all' ? 'bg-amber-100 text-amber-800' : 'text-gray-600 hover:bg-gray-50'}`}
      >
        All Accounts ({allCount})
      </button>
    </div>
  )
}
