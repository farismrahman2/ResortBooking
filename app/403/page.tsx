import Link from 'next/link'
import { ShieldOff } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: { from?: string }
}

const MODULE_LABELS: Record<string, string> = {
  bookings: 'Bookings',
  checkout: 'Checkout',
  expenses: 'Expenses',
  hr:       'HR',
  reports:  'Reports',
  settings: 'Settings',
}

export default function ForbiddenPage({ searchParams }: PageProps) {
  const fromLabel = searchParams.from ? (MODULE_LABELS[searchParams.from] ?? searchParams.from) : null

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <ShieldOff size={26} />
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">Access denied</h1>
        <p className="mt-2 text-sm text-slate-600">
          {fromLabel
            ? <>You don&apos;t have permission to view <span className="font-semibold text-slate-800">{fromLabel}</span>.</>
            : <>You don&apos;t have permission to view this section.</>}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Ask an administrator to grant access from <code className="font-mono">Settings → Roles</code>.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Back to dashboard
          </Link>
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
