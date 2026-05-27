import type { AssetCondition, AssetStatus } from '@/lib/supabase/types-fixed-assets'
import { CONDITION_LABELS, CONDITION_BADGE, STATUS_LABELS, STATUS_BADGE } from './labels'

export function ConditionBadge({ condition }: { condition: AssetCondition }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CONDITION_BADGE[condition]}`}>{CONDITION_LABELS[condition]}</span>
}

export function StatusBadge({ status }: { status: AssetStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}>{STATUS_LABELS[status]}</span>
}
