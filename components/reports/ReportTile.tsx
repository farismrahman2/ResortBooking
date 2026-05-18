import Link from 'next/link'
import { Lock } from 'lucide-react'
import type { ReportMeta } from './labels'

interface Props {
  meta:      ReportMeta
  /** Mini sparkline data (last 30 days) — only shown for the income tile right now. */
  sparkline?: number[]
  /** When true, renders greyed out + un-clickable. */
  disabled?:  boolean
  /** Tooltip explaining why it's disabled. */
  disabledReason?: string
}

function MiniSpark({ values }: { values: number[] }) {
  if (values.length === 0) return null
  const max = Math.max(1, ...values)
  const w = 80, h = 24
  const step = w / Math.max(1, values.length - 1)
  const points = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(' ')
  return (
    <svg width={w} height={h} className="opacity-70">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-indigo-500" />
    </svg>
  )
}

export function ReportTile({ meta, sparkline, disabled, disabledReason }: Props) {
  const Icon = meta.icon
  const inner = (
    <div className={`group flex items-start gap-3 rounded-xl border p-4 transition-colors ${
      disabled
        ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
        : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/30'
    }`}>
      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
        disabled ? 'bg-gray-100 text-gray-400' : 'bg-indigo-50 text-indigo-700'
      }`}>
        {disabled ? <Lock size={16} /> : <Icon size={18} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-sm font-semibold ${disabled ? 'text-gray-400' : 'text-gray-900'}`}>{meta.title}</p>
          {sparkline && !disabled && <MiniSpark values={sparkline} />}
        </div>
        <p className={`mt-0.5 text-xs ${disabled ? 'text-gray-400' : 'text-gray-500'}`}>
          {disabled && disabledReason ? disabledReason : meta.description}
        </p>
      </div>
    </div>
  )
  if (disabled) return inner
  return <Link href={meta.href}>{inner}</Link>
}
