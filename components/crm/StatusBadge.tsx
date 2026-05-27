import type { AccountStatus, TierSlug } from '@/lib/supabase/types-crm'
import { STATUS_LABELS, STATUS_BADGE, TIER_BADGE } from './labels'

export function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

export function TierBadge({ tier, label }: { tier: TierSlug; label?: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${TIER_BADGE[tier]}`}>
      {label ?? `Tier ${tier.toUpperCase()}`}
    </span>
  )
}
