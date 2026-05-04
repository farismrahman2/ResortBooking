'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { format } from 'date-fns'
import type { DailyExpenseRow } from '@/lib/queries/reports/expenses'

export function ExpenseTrendChart({ data }: { data: DailyExpenseRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d + 'T00:00:00'), 'd MMM')} fontSize={11} />
        <YAxis tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} fontSize={11} />
        <Tooltip
          formatter={(v: number) => `${v.toLocaleString('en-IN')} ৳`}
          labelFormatter={(d) => format(new Date(d + 'T00:00:00'), 'EEE d MMM yyyy')}
        />
        <Line type="monotone" dataKey="total" stroke="#e11d48" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
