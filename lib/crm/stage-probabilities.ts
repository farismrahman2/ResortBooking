import type { OpportunityStage } from '@/lib/supabase/types-crm'

export const DEFAULT_PROBABILITY_BY_STAGE: Record<OpportunityStage, number> = {
  prospect:          10,
  contacted:         20,
  meeting_scheduled: 30,
  meeting_done:      40,
  site_inspection:   50,
  proposal_sent:     65,
  negotiation:       80,
  won:               100,
  lost:              0,
  on_hold:           -1,   // sentinel: preserve current
}

export const STAGE_ORDER: OpportunityStage[] = [
  'prospect', 'contacted', 'meeting_scheduled', 'meeting_done',
  'site_inspection', 'proposal_sent', 'negotiation', 'won', 'lost', 'on_hold',
]

export const STAGE_LABELS: Record<OpportunityStage, string> = {
  prospect:          'Prospect',
  contacted:         'Contacted',
  meeting_scheduled: 'Meeting Scheduled',
  meeting_done:      'Meeting Done',
  site_inspection:   'Site Inspection',
  proposal_sent:     'Proposal Sent',
  negotiation:       'Negotiation',
  won:               'Won',
  lost:              'Lost',
  on_hold:           'On Hold',
}

/**
 * Resolve the probability when moving to `newStage`.
 *  - won → 100, lost → 0 (always forced)
 *  - on_hold → preserve current
 *  - otherwise: if the current value still matches the *old* stage default,
 *    it was never hand-edited → advance to the new stage default. If it
 *    differs, the user manually overrode it → preserve their value.
 */
export function getProbabilityForStage(
  newStage: OpportunityStage,
  oldStage: OpportunityStage,
  currentProb: number,
): number {
  if (newStage === 'won')  return 100
  if (newStage === 'lost') return 0
  if (newStage === 'on_hold') return currentProb
  const oldDefault = DEFAULT_PROBABILITY_BY_STAGE[oldStage]
  const wasManual = oldDefault >= 0 && currentProb !== oldDefault
  return wasManual ? currentProb : DEFAULT_PROBABILITY_BY_STAGE[newStage]
}
