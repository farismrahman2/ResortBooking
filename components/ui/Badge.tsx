import { cn } from '@/lib/utils'
import type { BookingStatus } from '@/lib/supabase/types'

interface BadgeProps {
  status: BookingStatus
  className?: string
}

/**
 * Colours come from the `status` scale in tailwind.config.ts rather than being
 * hardcoded here — that map existed but this component ignored it, so changing
 * a status colour meant editing two places and only one of them took effect.
 *
 * The full class strings are written out literally because Tailwind scans
 * source for complete class names; template-built ones get purged.
 */
const statusConfig: Record<BookingStatus, { label: string; className: string }> = {
  draft:       { label: 'Draft',       className: 'bg-status-draft/10 text-status-draft border-status-draft/25' },
  sent:        { label: 'Sent',        className: 'bg-status-sent/10 text-status-sent border-status-sent/25' },
  confirmed:   { label: 'Confirmed',   className: 'bg-status-confirmed/10 text-status-confirmed border-status-confirmed/30' },
  cancelled:   { label: 'Cancelled',   className: 'bg-status-cancelled/10 text-status-cancelled border-status-cancelled/25' },
  checked_out: { label: 'Checked Out', className: 'bg-status-checked_out/10 text-status-checked_out border-status-checked_out/25' },
  no_show:     { label: 'No-Show',     className: 'bg-status-no_show/10 text-status-no_show border-status-no_show/30' },
}

export function StatusBadge({ status, className }: BadgeProps) {
  const config = statusConfig[status] ?? statusConfig.draft
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  )
}

interface GenericBadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}

const variants = {
  default: 'bg-gray-100 text-gray-600 border-gray-200',
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger:  'bg-red-50 text-red-700 border-red-200',
  info:    'bg-blue-50 text-blue-700 border-blue-200',
}

export function Badge({ children, variant = 'default', className }: GenericBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}
