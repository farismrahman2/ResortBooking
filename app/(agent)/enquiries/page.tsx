import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listEnquiries, getEnquiryCounts, type EnquiryFilter } from '@/lib/queries/enquiries'
import { Badge } from '@/components/ui/Badge'
import type { EnquiryStatus } from '@/lib/supabase/types'
import { Inbox } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: 'New', contacted: 'Contacted', won: 'Won', lost: 'Lost',
}
const STATUS_VARIANT: Record<EnquiryStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  new: 'info', contacted: 'warning', won: 'success', lost: 'danger',
}
const TABS: Array<{ key: EnquiryFilter; label: string }> = [
  { key: 'new', label: 'New' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'all', label: 'All' },
]

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  await requirePermission('enquiries', 'read')

  const valid: EnquiryFilter[] = ['new', 'contacted', 'won', 'lost', 'all']
  const status: EnquiryFilter = valid.includes(searchParams.status as EnquiryFilter)
    ? (searchParams.status as EnquiryFilter)
    : 'new'

  let rows: Awaited<ReturnType<typeof listEnquiries>> = []
  let counts: Awaited<ReturnType<typeof getEnquiryCounts>> | null = null
  let migrationError: string | null = null
  try {
    ;[rows, counts] = await Promise.all([listEnquiries(status), getEnquiryCounts()])
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Enquiries"
        subtitle="Leads submitted on the public website — the DB is the system of record"
      />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {migrationError ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
            <p className="font-semibold">Enquiries module not ready</p>
            <p className="mt-1">
              The <code>enquiries</code> table isn&apos;t available yet. Run{' '}
              <code>migrations/enquiries-module/000_create_enquiries_module.sql</code> against the
              Supabase project, then reload.
            </p>
            <p className="mt-2 text-xs text-amber-700">{migrationError}</p>
          </div>
        ) : (
          <>
            {/* Status filter tabs */}
            <nav className="mb-5 flex flex-wrap gap-2" aria-label="Filter by status">
              {TABS.map(({ key, label }) => {
                const active = key === status
                const count = counts ? counts[key] : 0
                return (
                  <Link
                    key={key}
                    href={key === 'new' ? '/enquiries' : `/enquiries?status=${key}`}
                    className={
                      'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ' +
                      (active
                        ? 'border-forest-600 bg-forest-50 text-forest-800'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50')
                    }
                  >
                    {label}
                    <span
                      className={
                        'inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ' +
                        (active ? 'bg-forest-600 text-white' : 'bg-gray-100 text-gray-500')
                      }
                    >
                      {count}
                    </span>
                  </Link>
                )
              })}
            </nav>

            {rows.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-10 text-center">
                <Inbox size={32} className="mx-auto text-gray-300" />
                <p className="mt-3 text-base font-medium text-gray-700">
                  No {status === 'all' ? '' : STATUS_LABEL[status as EnquiryStatus].toLowerCase() + ' '}
                  enquiries yet.
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  New submissions from the public website will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Type</th>
                      <th className="px-4 py-3 font-semibold">Pax</th>
                      <th className="px-4 py-3 font-semibold">Phone</th>
                      <th className="px-4 py-3 font-semibold">Date</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link
                            href={`/enquiries/${r.id}`}
                            className="inline-flex items-center gap-2 font-medium text-forest-800 hover:underline"
                          >
                            {!r.seen_at && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-amber-500"
                                title="New — not yet opened"
                                aria-label="New"
                              />
                            )}
                            {r.name}
                          </Link>
                          {r.organisation && (
                            <div className="text-xs text-gray-500">{r.organisation}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{r.type}</td>
                        <td className="px-4 py-3 text-gray-700">{r.pax}</td>
                        <td className="px-4 py-3 text-gray-700">{r.phone}</td>
                        <td className="px-4 py-3 text-gray-700">{r.date_text || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-500" title={r.created_at}>
                          {ago(r.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
