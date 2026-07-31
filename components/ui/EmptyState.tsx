import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * The one empty state for the whole app.
 *
 * The distinction that matters: "nothing here yet" is an invitation to create
 * something, whereas "nothing matched your filters" is a dead end unless you
 * offer a way back. Most of this app's ~40 hand-rolled empty states were the
 * second kind rendered as the first — a big empty box with no way forward.
 *
 *   <EmptyState variant="empty"    icon={<Boxes />} title="No items yet"
 *               description="…"    action={{ label: 'Add item', href: '/x/new' }} />
 *   <EmptyState variant="filtered" title="No items match" onClear={clearAll} />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  onClear,
  variant = 'empty',
  compact,
  className,
}: {
  icon?:        React.ReactNode
  title:        string
  description?: string
  /** Primary CTA. Use for "create the first one". */
  action?:      { label: string; href: string } | { label: string; onClick: () => void }
  secondaryAction?: { label: string; href: string }
  /** Shown as a "Clear filters" button — pair with variant="filtered". */
  onClear?:     () => void
  variant?:     'empty' | 'filtered'
  /** Tighter padding for inline/in-card use. */
  compact?:     boolean
  className?:   string
}) {
  const isFiltered = variant === 'filtered'

  return (
    <div
      className={cn(
        'rounded-2xl bg-white text-center',
        isFiltered ? 'border border-gray-200' : 'border-2 border-dashed border-gray-300',
        compact ? 'px-4 py-8' : 'px-6 py-14',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'mx-auto flex items-center justify-center rounded-full',
            compact ? 'h-11 w-11' : 'h-14 w-14',
            isFiltered ? 'bg-gray-100 text-gray-400' : 'bg-forest-50 text-forest-600',
          )}
        >
          {icon}
        </div>
      )}
      <p className={cn('font-semibold text-gray-800', icon && 'mt-3', compact ? 'text-sm' : 'text-base')}>
        {title}
      </p>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{description}</p>
      )}

      {(action || onClear || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Clear filters
            </button>
          )}
          {action && ('href' in action ? (
            <Link
              href={action.href}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-forest-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-forest-800"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-forest-700 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-forest-800"
            >
              {action.label}
            </button>
          ))}
          {secondaryAction && (
            <Link
              href={secondaryAction.href}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              {secondaryAction.label}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
