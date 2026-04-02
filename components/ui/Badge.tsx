import { cn } from '@/lib/utils'
import type { BookingStatus } from '@/lib/supabase/types'

interface BadgeProps {
  status: BookingStatus
  className?: string
}

const statusConfig: Record<BookingStatus, { label: string; className: string }> = {
  draft:     { label: 'Draft',     className: 'bg-gray-100 text-gray-600 border-gray-200' },
  sent:      { label: 'Sent',      className: 'bg-blue-50 text-blue-700 border-blue-200' },
  confirmed: { label: 'Confirmed', className: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-700 border-red-200' },
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
