import { ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { computeChange, changeSentiment } from '@/lib/reports/comparison'
import { formatChange } from '@/lib/reports/format'
import type { ComparisonMode } from '@/lib/reports/types'

interface Props {
  label:       string
  value:       string             // pre-formatted value (caller decides currency / formatting)
  raw?:        number             // raw numeric value for delta math
  prior?:      number | null      // raw prior value
  yoy?:        number | null      // raw yoy value
  mode?:       ComparisonMode
  /** Lower-is-better (e.g. expenses, salary %) flips the colour of deltas. */
  invertColour?: boolean
  /** Tooltip / footnote (e.g. "Need data from May 2025 for YoY"). */
  note?:       string
  /** Visual emphasis (e.g. for Net P&L). */
  emphasis?:   'default' | 'positive' | 'negative'
}

function deltaRow(label: string, current: number | undefined, prior: number | null | undefined, invert: boolean) {
  if (current === undefined || prior === undefined || prior === null) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-gray-400">
        <Minus size={10} /> {label}: —
      </div>
    )
  }
  const change = computeChange(current, prior)
  const sentiment = changeSentiment(change, invert)
  const tone = sentiment === 'good' ? 'text-emerald-700' : sentiment === 'bad' ? 'text-rose-700' : 'text-gray-500'
  const Icon = change.direction === 'up' ? ArrowUp : change.direction === 'down' ? ArrowDown : Minus
  return (
    <div className={`flex items-center gap-1 text-[10px] ${tone}`}>
      <Icon size={10} /> {label}: {formatChange(change, { currency: false })}
    </div>
  )
}

export function KpiCard({ label, value, raw, prior, yoy, mode = 'off', invertColour, note, emphasis = 'default' }: Props) {
  const valueTone =
    emphasis === 'positive' ? 'text-emerald-700'
    : emphasis === 'negative' ? 'text-rose-700'
    : 'text-gray-900'

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${valueTone}`} title={note}>{value}</p>
      {(mode === 'previous_period' || mode === 'both') && deltaRow('vs prev', raw, prior, !!invertColour)}
      {(mode === 'year_over_year'  || mode === 'both') && deltaRow('YoY',     raw, yoy,   !!invertColour)}
      {note && mode === 'off' && <p className="text-[10px] text-gray-400">{note}</p>}
    </div>
  )
}
