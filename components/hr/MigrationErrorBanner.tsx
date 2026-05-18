import { AlertTriangle } from 'lucide-react'

interface Props {
  error: string
}

/**
 * Shown when an HR page can't load its data — most often because the
 * Supabase migrations under `migrations/hr-module/` haven't been run
 * (tables missing) or RLS policies are misconfigured.
 */
export function MigrationErrorBanner({ error }: Props) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-amber-900">HR module isn&apos;t fully set up</h3>
          <p className="mt-1 text-xs text-amber-800">
            The page couldn&apos;t load. The most common cause is that the SQL migrations under{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">migrations/hr-module/</code>{' '}
            haven&apos;t been run in Supabase yet.
          </p>
          <ol className="mt-3 list-decimal list-inside space-y-0.5 text-xs text-amber-800">
            <li>Make sure the expense module migrations have already been applied</li>
            <li><code className="font-mono">000_create_hr_tables.sql</code> — 10 tables, indexes, seed leave types, RLS</li>
          </ol>
        </div>
      </div>
      <details className="rounded-lg bg-white border border-amber-200 px-3 py-2">
        <summary className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 cursor-pointer">
          Error detail
        </summary>
        <pre className="mt-2 text-xs text-red-700 whitespace-pre-wrap font-mono">{error}</pre>
      </details>
    </div>
  )
}
