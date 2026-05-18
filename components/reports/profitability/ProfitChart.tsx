'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts'
import { format } from 'date-fns'
import type { MonthlyPnLRow } from '@/lib/queries/reports/profitability'

export function ProfitChart({ data }: { data: MonthlyPnLRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" tickFormatter={(m) => format(new Date(m + 'T00:00:00'), 'MMM')} fontSize={11} />
        <YAxis tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} fontSize={11} />
        <Tooltip
          formatter={(v: number) => `${v.toLocaleString('en-IN')} ৳`}
          labelFormatter={(m) => format(new Date(m + 'T00:00:00'), 'MMM yyyy')}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="income"   name="Income"   stroke="#059669" strokeWidth={2} />
        <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#e11d48" strokeWidth={2} />
        <Line type="monotone" dataKey="net"      name="Net"      stroke="#4f46e5" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}
