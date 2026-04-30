import { AlertTriangle } from 'lucide-react'

export function MigrationErrorBanner({ error }: { error: string }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle size={20} className="text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-amber-900">Checkout module isn&apos;t fully set up</h3>
          <p className="mt-1 text-xs text-amber-800">
            Run the SQL migration under{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">migrations/checkout-module/</code>{' '}
            in Supabase first. The auth-roles migration must already be applied.
          </p>
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
