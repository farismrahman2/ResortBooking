import { AlertTriangle } from 'lucide-react'

interface Props {
  error: string
}

/**
 * Shown when an expense page can't load its data — most often because the
 * Supabase migrations under `migrations/expense-module/` haven't been run
 * (tables / RPC / Storage bucket missing) or RLS policies are misconfigured.
 */
export function MigrationErrorBanner({ error }: Props) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-amber-900">Expense module isn't fully set up</h3>
          <p className="mt-1 text-xs text-amber-800">
            The page couldn't load. The most common cause is that the SQL migrations under{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">migrations/expense-module/</code>{' '}
            haven't been run in Supabase yet.
          </p>
          <ol className="mt-3 list-decimal list-inside space-y-0.5 text-xs text-amber-800">
            <li><code className="font-mono">000_extend_entity_type_enum.sql</code> — run alone first</li>
            <li><code className="font-mono">001_expense_schema.sql</code> — tables, indexes, RLS</li>
            <li><code className="font-mono">002_seed_categories_and_payees.sql</code> — default catalog</li>
            <li><code className="font-mono">003_expense_pivot_rpc.sql</code> — for the monthly report</li>
            <li>Storage → create bucket <code className="font-mono">expense-receipts</code> (Private), then run <code className="font-mono">004_storage_bucket.sql</code></li>
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
