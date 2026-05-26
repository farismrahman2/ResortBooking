import { AlertTriangle } from 'lucide-react'

export function MigrationErrorBanner({ error }: { error: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">Fixed Assets module not yet migrated</p>
          <p className="mt-1 text-xs">
            Run <code className="rounded bg-amber-100 px-1 py-0.5">migrations/fixed-assets-module/000_create_fixed_assets_tables.sql</code> in the Supabase SQL editor, then refresh.
          </p>
          <p className="mt-2 text-[11px] font-mono text-amber-800/80">{error}</p>
        </div>
      </div>
    </div>
  )
}
