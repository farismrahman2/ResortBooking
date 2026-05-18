import type { HubTotals } from '@/lib/queries/reports/hub'

export interface Anomaly {
  severity: 'info' | 'warn' | 'alert'
  message:  string
  link?:    string
}

interface AnomalyInput {
  current:  HubTotals
  /** Same week last month, optional. */
  monthAgo: HubTotals | null
  salaryPct: number | null
  weekendOccupancyMin: number | null   // lowest weekend day occupancy in the week
  expensesByCategoryMoMSwing?: Array<{ category: string; pct_change: number }>
}

const ANOMALY_THRESHOLDS = {
  REVENUE_MOM_SWING_PCT: 30,
  EXPENSE_CATEGORY_MOM_PCT: 50,
  WEEKEND_OCCUPANCY_FLOOR: 30,
  SALARY_HIGH_PCT: 35,
}

export function detectAnomalies(input: AnomalyInput): Anomaly[] {
  const out: Anomaly[] = []

  if (input.monthAgo && input.monthAgo.total_revenue > 0) {
    const swing = ((input.current.total_revenue - input.monthAgo.total_revenue) / input.monthAgo.total_revenue) * 100
    if (Math.abs(swing) >= ANOMALY_THRESHOLDS.REVENUE_MOM_SWING_PCT) {
      out.push({
        severity: 'warn',
        message: `Revenue ${swing > 0 ? 'up' : 'down'} ${Math.abs(swing).toFixed(0)}% vs same week last month`,
        link: '/reports/income',
      })
    }
  }

  for (const cat of input.expensesByCategoryMoMSwing ?? []) {
    if (cat.pct_change >= ANOMALY_THRESHOLDS.EXPENSE_CATEGORY_MOM_PCT) {
      out.push({
        severity: 'alert',
        message: `${cat.category} expenses up ${cat.pct_change.toFixed(0)}% vs same week last month`,
        link: '/reports/expenses',
      })
    }
  }

  if (input.weekendOccupancyMin !== null && input.weekendOccupancyMin < ANOMALY_THRESHOLDS.WEEKEND_OCCUPANCY_FLOOR) {
    out.push({
      severity: 'warn',
      message: `Weekend occupancy dropped to ${input.weekendOccupancyMin.toFixed(0)}% — investigate marketing/pricing`,
      link: '/reports/operations',
    })
  }

  if (input.salaryPct !== null && input.salaryPct > ANOMALY_THRESHOLDS.SALARY_HIGH_PCT) {
    out.push({
      severity: 'alert',
      message: `Salary % of revenue at ${input.salaryPct.toFixed(1)}% — above 35% benchmark`,
      link: '/reports/hr/salary-vs-revenue',
    })
  }

  return out.slice(0, 3)
}
