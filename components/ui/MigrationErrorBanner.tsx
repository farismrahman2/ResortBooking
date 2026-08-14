import { AlertTriangle } from 'lucide-react'

/**
 * Generic "this module isn't migrated yet" banner.
 *
 * Each module previously kept its own copy with its own name hardcoded, which
 * meant borrowing another module's banner printed the wrong module name — a
 * kitchen page confidently telling you to run the CRM migration sends you to
 * fix something that isn't broken. This one takes the name and path.
 */
export function MigrationErrorBanner({
  error, moduleName, migrationPath,
}: {
  error: string
  /** e.g. "Kitchen" — shown in the heading. */
  moduleName?: string
  /** e.g. "migrations/kitchen-module/000_create_requisitions.sql" */
  migrationPath?: string
}) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-5">
      <p className="flex items-start gap-2 font-semibold text-amber-900">
        <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
        {moduleName ? `${moduleName} module not ready` : 'This module is not ready'}
      </p>
      {migrationPath && (
        <p className="mt-1.5 text-sm text-amber-900">
          Run <code className="rounded bg-amber-100 px-1 text-xs">{migrationPath}</code> in the
          Supabase SQL editor, then refresh.
        </p>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-xs font-medium text-amber-800 hover:underline">
          Error detail
        </summary>
        <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-amber-100/60 p-2 text-[11px] leading-relaxed text-amber-900">
          {error}
        </pre>
      </details>
    </div>
  )
}
