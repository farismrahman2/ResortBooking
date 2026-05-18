import type { ReactNode } from 'react'

interface Props {
  title?:    string
  subtitle?: string
  action?:   ReactNode
  children:  ReactNode
  /** Override the default fixed height. */
  className?: string
}

/**
 * Wrapper for any chart on a report page. Keeps headers and surrounding
 * chrome consistent across reports. Charts inside should use a
 * <ResponsiveContainer width="100%" height="100%"> from recharts.
 */
export function ChartCard({ title, subtitle, action, children, className }: Props) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-4 ${className ?? ''}`}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            {title && <h3 className="text-sm font-semibold text-gray-900">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="h-64">{children}</div>
    </div>
  )
}
