export type KpiMetric =
  | 'accounts_mapped' | 'contacts_identified' | 'meetings_booked' | 'site_inspections_held'
  | 'proposals_sent' | 'deals_closed_won' | 'closed_revenue_bdt' | 'active_pipeline_bdt'
  | 'field_visits_done' | 'linkedin_followers' | 'repeat_corporate_clients' | 'preferred_vendor_agreements'

export const KPI_METRICS: KpiMetric[] = [
  'accounts_mapped', 'contacts_identified', 'meetings_booked', 'site_inspections_held',
  'proposals_sent', 'deals_closed_won', 'closed_revenue_bdt', 'active_pipeline_bdt',
  'field_visits_done', 'linkedin_followers', 'repeat_corporate_clients', 'preferred_vendor_agreements',
]

export const KPI_METRIC_LABELS: Record<KpiMetric, string> = {
  accounts_mapped:            'Accounts mapped',
  contacts_identified:        'Contacts identified',
  meetings_booked:            'Meetings booked',
  site_inspections_held:      'Site inspections held',
  proposals_sent:             'Proposals sent',
  deals_closed_won:           'Deals closed (Won)',
  closed_revenue_bdt:         'Closed revenue (BDT)',
  active_pipeline_bdt:        'Active pipeline (BDT)',
  field_visits_done:          'Field visits done',
  linkedin_followers:         'LinkedIn followers',
  repeat_corporate_clients:   'Repeat corporate clients',
  preferred_vendor_agreements:'Preferred vendor agreements',
}

/** Metrics measured in BDT (rendered with formatBDT) rather than counts. */
export const KPI_MONEY_METRICS = new Set<KpiMetric>(['closed_revenue_bdt', 'active_pipeline_bdt'])

/** Metrics not auto-computed by the RPC (entered/observed manually). */
export const KPI_MANUAL_METRICS = new Set<KpiMetric>([
  'linkedin_followers', 'repeat_corporate_clients', 'preferred_vendor_agreements',
])

export type KpiStatus = 'green' | 'amber' | 'red' | 'na'

/** Pro-rated on-track status: green ≥ pro-rated target, amber 80–99%, red < 80%. */
export function kpiStatus(actual: number, target: number, dayInPeriod: number, periodDays: number): KpiStatus {
  if (target <= 0) return 'na'
  const proRated = target * (dayInPeriod / periodDays)
  if (proRated <= 0) return 'na'
  const ratio = actual / proRated
  if (ratio >= 1)    return 'green'
  if (ratio >= 0.8)  return 'amber'
  return 'red'
}
