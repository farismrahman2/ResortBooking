import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { DraftConfirmCard } from '@/components/expenses/DraftConfirmCard'
import { getDrafts } from '@/lib/queries/expenses'

export const dynamic = 'force-dynamic'

export default async function DraftsPage() {
  let drafts: Awaited<ReturnType<typeof getDrafts>> = []
  let migrationError: string | null = null
  try {
    drafts = await getDrafts()
  } catch (err) {
    migrationError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Pending Drafts"
        subtitle={drafts.length > 0
          ? `${drafts.length} draft${drafts.length !== 1 ? 's' : ''} waiting for review`
          : 'Auto-generated recurring expenses to review'}
      />

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-3">
          {migrationError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              Could not load drafts. {migrationError}
            </div>
          ) : drafts.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
              <p className="text-sm font-medium text-gray-700">No pending drafts</p>
              <p className="mt-1 text-xs text-gray-500">
                Generate drafts for a month from the{' '}
                <Link href="/expenses/recurring" className="text-forest-700 hover:underline">recurring templates</Link> page.
              </p>
            </div>
          ) : (
            drafts.map((d) => <DraftConfirmCard key={d.id} draft={d} />)
          )}
        </div>
      </div>
    </div>
  )
}
