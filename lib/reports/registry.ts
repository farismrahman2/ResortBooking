import { format } from 'date-fns'
import type { PeriodRange } from './types'
import type { ReportExportPayload } from './export/types'
import { getHubTotals } from '@/lib/queries/reports/hub'
import { getDailyIncome, getPackageRevenue, getDayOfWeekStats, getIndustryKpis } from '@/lib/queries/reports/income'
import { getDailyExpenses, getCategoryBreakdownReports, getTopVendors, getBudgetVsActual } from '@/lib/queries/reports/expenses'
import { getMonthlyPnL, getCashPosition } from '@/lib/queries/reports/profitability'
import { getOccupancyByDay, getPickupPace } from '@/lib/queries/reports/operations'
import { getSalaryVsRevenue, getAttendanceReport, getLoanExposure } from '@/lib/queries/reports/hr'
import { getExtrasOverview, getTopChargeItems, getExtrasByRoomType } from '@/lib/queries/reports/checkout'
import { getCoffeeShopOverview } from '@/lib/queries/reports/coffee-shop'

export type ReportBuilder = (period: PeriodRange, generatedBy: string) => Promise<ReportExportPayload>

const stamp = () => new Date()

const REGISTRY: Record<string, ReportBuilder> = {
  income: async (period, generatedBy) => {
    const [hub, daily, pkg, industry] = await Promise.all([
      getHubTotals(period), getDailyIncome(period), getPackageRevenue(period), getIndustryKpis(period),
    ])
    return {
      reportId: 'income',
      title: 'Income overview',
      subtitle: period.label,
      generatedAt: stamp(),
      generatedBy,
      kpis: [
        { label: 'Total revenue',  value: `${hub.total_revenue.toLocaleString('en-IN')} ৳` },
        { label: 'Room revenue',   value: `${hub.room_revenue.toLocaleString('en-IN')} ৳` },
        { label: 'Extras revenue', value: `${hub.extras_revenue.toLocaleString('en-IN')} ৳` },
        { label: 'Bookings',       value: String(hub.booking_count) },
        { label: 'ADR',            value: industry.adr    !== null ? `${industry.adr.toLocaleString('en-IN')} ৳`    : '—' },
        { label: 'RevPAR',         value: industry.revpar !== null ? `${industry.revpar.toLocaleString('en-IN')} ৳` : '—' },
      ],
      tables: [
        {
          title: 'Daily revenue',
          columns: [
            { key: 'date',           label: 'Date',     format: 'date' },
            { key: 'room_revenue',   label: 'Room',     align: 'right', format: 'currency' },
            { key: 'extras_revenue', label: 'Extras',   align: 'right', format: 'currency' },
            { key: 'total_revenue',  label: 'Total',    align: 'right', format: 'currency' },
            { key: 'bookings',       label: 'Bookings', align: 'right', format: 'number' },
          ],
          rows: daily,
        },
        {
          title: 'Revenue by package',
          columns: [
            { key: 'package_name',    label: 'Package' },
            { key: 'bookings',        label: 'Bookings',   align: 'right', format: 'number' },
            { key: 'total_revenue',   label: 'Revenue',    align: 'right', format: 'currency' },
            { key: 'avg_per_booking', label: 'Avg / book', align: 'right', format: 'currency' },
            { key: 'pct_of_total',    label: '% of total', align: 'right', format: 'percent' },
          ],
          rows: pkg,
        },
      ],
    }
  },

  'income-by-package': async (period, generatedBy) => {
    const rows = await getPackageRevenue(period)
    return {
      reportId: 'income-by-package', title: 'Revenue by package', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [{ label: 'Total revenue', value: `${rows.reduce((s, r) => s + r.total_revenue, 0).toLocaleString('en-IN')} ৳` }],
      tables: [{ title: 'By package', columns: [
        { key: 'package_name', label: 'Package' },
        { key: 'bookings', label: 'Bookings', align: 'right', format: 'number' },
        { key: 'total_revenue', label: 'Revenue', align: 'right', format: 'currency' },
        { key: 'avg_per_booking', label: 'Avg', align: 'right', format: 'currency' },
        { key: 'pct_of_total', label: '%', align: 'right', format: 'percent' },
      ], rows }],
    }
  },

  'income-by-day-of-week': async (period, generatedBy) => {
    const rows = await getDayOfWeekStats(period)
    return {
      reportId: 'income-by-day-of-week', title: 'Day-of-week pattern', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [],
      tables: [{ title: 'By weekday', columns: [
        { key: 'label', label: 'Day' },
        { key: 'days_in_period', label: 'Days', align: 'right', format: 'number' },
        { key: 'total_revenue',  label: 'Revenue', align: 'right', format: 'currency' },
        { key: 'bookings', label: 'Bookings', align: 'right', format: 'number' },
        { key: 'avg_revenue_per_day', label: 'Avg / day', align: 'right', format: 'currency' },
        { key: 'avg_occupancy_pct', label: 'Occupancy %', align: 'right', format: 'percent' },
      ], rows }],
    }
  },

  expenses: async (period, generatedBy) => {
    const [hub, daily, breakdown, vendors] = await Promise.all([
      getHubTotals(period), getDailyExpenses(period), getCategoryBreakdownReports(period), getTopVendors(period),
    ])
    return {
      reportId: 'expenses', title: 'Expense overview', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [
        { label: 'Total expenses', value: `${hub.total_expenses.toLocaleString('en-IN')} ৳` },
        { label: 'Transactions',   value: String(daily.reduce((s, d) => s + d.count, 0)) },
      ],
      tables: [
        { title: 'Daily expenses', columns: [
          { key: 'date', label: 'Date', format: 'date' },
          { key: 'total', label: 'Total', align: 'right', format: 'currency' },
          { key: 'count', label: 'Tx', align: 'right', format: 'number' },
        ], rows: daily },
        { title: 'By category group', columns: [
          { key: 'group', label: 'Group' },
          { key: 'total', label: 'Total', align: 'right', format: 'currency' },
          { key: 'pct',   label: '%',     align: 'right', format: 'percent' },
        ], rows: breakdown.groups },
        { title: 'Top vendors', columns: [
          { key: 'payee_name', label: 'Vendor' },
          { key: 'payee_type', label: 'Type' },
          { key: 'transactions', label: 'Tx', align: 'right', format: 'number' },
          { key: 'total', label: 'Spend', align: 'right', format: 'currency' },
        ], rows: vendors },
      ],
    }
  },

  'budget-vs-actual': async (period, generatedBy) => {
    const rows = await getBudgetVsActual(period)
    return {
      reportId: 'budget-vs-actual', title: 'Budget vs actual', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [],
      tables: [{ title: 'Variance by category', columns: [
        { key: 'category_name', label: 'Category' },
        { key: 'budgeted', label: 'Budgeted', align: 'right', format: 'currency' },
        { key: 'actual',   label: 'Actual',   align: 'right', format: 'currency' },
        { key: 'variance', label: 'Variance', align: 'right', format: 'currency' },
        { key: 'variance_pct', label: '% var', align: 'right', format: 'percent' },
        { key: 'status',   label: 'Status' },
      ], rows }],
    }
  },

  profitability: async (period, generatedBy) => {
    const rows = await getMonthlyPnL(period)
    const totals = rows.reduce((a, r) => ({
      income: a.income + r.income, expenses: a.expenses + r.expenses, net: a.net + r.net,
    }), { income: 0, expenses: 0, net: 0 })
    const margin = totals.income > 0 ? Math.round((totals.net / totals.income) * 1000) / 10 : null
    return {
      reportId: 'profitability', title: 'Profitability', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [
        { label: 'Income',   value: `${totals.income.toLocaleString('en-IN')} ৳` },
        { label: 'Expenses', value: `${totals.expenses.toLocaleString('en-IN')} ৳` },
        { label: 'Net',      value: `${totals.net.toLocaleString('en-IN')} ৳` },
        { label: 'Margin',   value: margin === null ? '—' : `${margin}%` },
      ],
      tables: [{ title: 'Monthly P&L', columns: [
        { key: 'month',      label: 'Month',    format: 'date' },
        { key: 'income',     label: 'Income',   align: 'right', format: 'currency' },
        { key: 'expenses',   label: 'Expenses', align: 'right', format: 'currency' },
        { key: 'net',        label: 'Net',      align: 'right', format: 'currency' },
        { key: 'margin_pct', label: 'Margin',   align: 'right', format: 'percent' },
      ], rows, totals: {
        month: 'Total', income: totals.income, expenses: totals.expenses, net: totals.net, margin_pct: margin,
      } }],
    }
  },

  'cash-position': async (period, generatedBy) => {
    const rows = await getCashPosition(period)
    const last = rows[rows.length - 1]
    return {
      reportId: 'cash-position', title: 'Cash position', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [{ label: 'Current balance', value: last ? `${last.balance.toLocaleString('en-IN')} ৳` : '—' }],
      tables: [{ title: 'Daily balance', columns: [
        { key: 'date', label: 'Date', format: 'date' },
        { key: 'cumulative_income',   label: 'Cum. income',   align: 'right', format: 'currency' },
        { key: 'cumulative_expenses', label: 'Cum. expenses', align: 'right', format: 'currency' },
        { key: 'balance',             label: 'Balance',       align: 'right', format: 'currency' },
      ], rows }],
      notes: ['Book cash position — income recognised when booked, expenses when entered. Not a bank-account balance.'],
    }
  },

  operations: async (period, generatedBy) => {
    const [days, pickup] = await Promise.all([getOccupancyByDay(period), getPickupPace()])
    return {
      reportId: 'operations', title: 'Operations', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [],
      tables: [
        { title: 'Daily occupancy', columns: [
          { key: 'date',           label: 'Date', format: 'date' },
          { key: 'rooms_occupied', label: 'Rooms occupied', align: 'right', format: 'number' },
          { key: 'total_rooms',    label: 'Total rooms',    align: 'right', format: 'number' },
          { key: 'occupancy_pct',  label: '%',              align: 'right', format: 'percent' },
        ], rows: days },
        { title: 'Pickup pace — 8 weeks', columns: [
          { key: 'week_label',      label: 'Week' },
          { key: 'rooms_booked',    label: 'Booked',    align: 'right', format: 'number' },
          { key: 'rooms_available', label: 'Available', align: 'right', format: 'number' },
          { key: 'pct_booked',      label: '%',         align: 'right', format: 'percent' },
        ], rows: pickup },
      ],
    }
  },

  'hr-salary-vs-revenue': async (period, generatedBy) => {
    const rows = await getSalaryVsRevenue(period)
    return {
      reportId: 'hr-salary-vs-revenue', title: 'Salary % of revenue', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [], tables: [{ title: 'Monthly', columns: [
        { key: 'month', label: 'Month', format: 'date' },
        { key: 'revenue',       label: 'Revenue', align: 'right', format: 'currency' },
        { key: 'payroll_total', label: 'Payroll', align: 'right', format: 'currency' },
        { key: 'salary_pct',    label: '%',       align: 'right', format: 'percent' },
        { key: 'status',        label: 'Status' },
      ], rows }],
    }
  },

  'hr-attendance': async (period, generatedBy) => {
    const data = await getAttendanceReport(period)
    return {
      reportId: 'hr-attendance', title: 'Attendance trends', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [
        { label: 'Avg attendance rate', value: `${data.totals.attendance_rate_pct.toFixed(1)}%` },
        { label: 'Total absent days',   value: String(data.totals.total_absent_days) },
        { label: 'Total leave days',    value: String(data.totals.total_leave_days) },
      ],
      tables: [
        { title: 'By department', columns: [
          { key: 'department',          label: 'Department' },
          { key: 'active_staff',        label: 'Active staff', align: 'right', format: 'number' },
          { key: 'attendance_rate_pct', label: 'Attendance %', align: 'right', format: 'percent' },
          { key: 'absent_days',         label: 'Absent',       align: 'right', format: 'number' },
          { key: 'paid_leave_days',     label: 'Paid leave',   align: 'right', format: 'number' },
          { key: 'unpaid_leave_days',   label: 'Unpaid leave', align: 'right', format: 'number' },
          { key: 'half_days',           label: 'Half days',    align: 'right', format: 'number' },
        ], rows: data.byDepartment },
        { title: 'Top absentees', columns: [
          { key: 'full_name',     label: 'Employee' },
          { key: 'employee_code', label: 'Code' },
          { key: 'department',    label: 'Department' },
          { key: 'absent_days',   label: 'Absent days', align: 'right', format: 'number' },
        ], rows: data.topAbsentees },
      ],
    }
  },

  'hr-loan-exposure': async (period, generatedBy) => {
    const data = await getLoanExposure()
    return {
      reportId: 'hr-loan-exposure', title: 'Loan exposure', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [
        { label: 'Total outstanding',     value: `${data.totals.total_outstanding.toLocaleString('en-IN')} ৳` },
        { label: 'Active loans',          value: String(data.totals.active_loans) },
        { label: '% of monthly payroll',  value: data.totals.pct_of_payroll === null ? '—' : `${data.totals.pct_of_payroll}%` },
      ],
      tables: [
        { title: 'Active loans', columns: [
          { key: 'employee_name',       label: 'Employee' },
          { key: 'employee_code',       label: 'Code' },
          { key: 'principal',           label: 'Principal',   align: 'right', format: 'currency' },
          { key: 'monthly_installment', label: 'EMI',         align: 'right', format: 'currency' },
          { key: 'repaid',              label: 'Repaid',      align: 'right', format: 'currency' },
          { key: 'outstanding',         label: 'Outstanding', align: 'right', format: 'currency' },
          { key: 'months_remaining',    label: 'Months left', align: 'right', format: 'number' },
          { key: 'taken_on',            label: 'Taken on',    format: 'date' },
        ], rows: data.active },
        { title: 'Aging', columns: [
          { key: 'bucket',            label: 'Age' },
          { key: 'count',             label: 'Loans',       align: 'right', format: 'number' },
          { key: 'total_outstanding', label: 'Outstanding', align: 'right', format: 'currency' },
        ], rows: data.aging },
      ],
    }
  },

  'checkout-extras': async (period, generatedBy) => {
    const data = await getExtrasOverview(period)
    return {
      reportId: 'checkout-extras', title: 'Extras revenue', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [
        { label: 'Total extras',        value: `${data.total_extras_revenue.toLocaleString('en-IN')} ৳` },
        { label: 'Finalized checkouts', value: String(data.finalized_checkouts) },
        { label: 'Avg per guest',       value: `${data.avg_extras_per_guest.toLocaleString('en-IN')} ৳` },
        { label: 'F&B subset',          value: `${data.fb_revenue.toLocaleString('en-IN')} ৳` },
      ],
      tables: [
        { title: 'Daily extras', columns: [
          { key: 'date', label: 'Date', format: 'date' },
          { key: 'total', label: 'Extras', align: 'right', format: 'currency' },
        ], rows: data.daily },
        { title: 'By category', columns: [
          { key: 'category', label: 'Category' },
          { key: 'total', label: 'Revenue', align: 'right', format: 'currency' },
          { key: 'pct',   label: '%',       align: 'right', format: 'percent' },
        ], rows: data.by_category },
      ],
    }
  },

  'checkout-top-items': async (period, generatedBy) => {
    const rows = await getTopChargeItems(period, 50)
    return {
      reportId: 'checkout-top-items', title: 'Top-selling items', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [],
      tables: [{ title: 'Top items', columns: [
        { key: 'item_name',     label: 'Item' },
        { key: 'category',      label: 'Category' },
        { key: 'times_sold',    label: 'Times sold', align: 'right', format: 'number' },
        { key: 'total_qty',     label: 'Qty',        align: 'right', format: 'number' },
        { key: 'avg_price',     label: 'Avg price',  align: 'right', format: 'currency' },
        { key: 'total_revenue', label: 'Revenue',    align: 'right', format: 'currency' },
      ], rows }],
    }
  },

  'coffee-shop': async (period, generatedBy) => {
    const data = await getCoffeeShopOverview(period)
    return {
      reportId: 'coffee-shop', title: 'Coffee Shop', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [
        { label: 'Sales',        value: String(data.sales_count) },
        { label: 'Net revenue',  value: `${data.net_revenue.toLocaleString('en-IN')} ৳` },
        { label: 'Avg sale',     value: `${data.avg_sale.toLocaleString('en-IN')} ৳` },
        { label: 'Comp value',   value: `${data.comp_value.toLocaleString('en-IN')} ৳` },
      ],
      tables: [
        { title: 'Daily revenue', columns: [
          { key: 'date',    label: 'Date',    format: 'date' },
          { key: 'revenue', label: 'Revenue', align: 'right', format: 'currency' },
        ], rows: data.daily },
        { title: 'Top items', columns: [
          { key: 'name',       label: 'Item' },
          { key: 'category',   label: 'Category' },
          { key: 'units_sold', label: 'Units sold', align: 'right', format: 'number' },
          { key: 'revenue',    label: 'Revenue',    align: 'right', format: 'currency' },
        ], rows: data.top_items },
        { title: 'Payment mix', columns: [
          { key: 'method', label: 'Method' },
          { key: 'amount', label: 'Amount', align: 'right', format: 'currency' },
          { key: 'pct',    label: '%',      align: 'right', format: 'percent' },
        ], rows: data.payment_mix },
      ],
      notes: ['Comp items count toward units sold but not revenue.'],
    }
  },

  'checkout-by-room-type': async (period, generatedBy) => {
    const rows = await getExtrasByRoomType(period)
    return {
      reportId: 'checkout-by-room-type', title: 'Extras by room type', subtitle: period.label, generatedAt: stamp(), generatedBy,
      kpis: [],
      tables: [{ title: 'By room type', columns: [
        { key: 'room_type',           label: 'Room type' },
        { key: 'finalized_checkouts', label: 'Checkouts', align: 'right', format: 'number' },
        { key: 'extras_revenue',      label: 'Extras revenue', align: 'right', format: 'currency' },
        { key: 'avg_per_checkout',    label: 'Avg / checkout', align: 'right', format: 'currency' },
      ], rows }],
    }
  },
}

export function getReportBuilder(id: string): ReportBuilder | undefined {
  return REGISTRY[id]
}

export function listReportIds(): string[] { return Object.keys(REGISTRY) }
