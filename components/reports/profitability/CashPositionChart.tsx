'use client'

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import { format } from 'date-fns'
import type { CashPositionPoint } from '@/lib/queries/reports/profitability'

export function CashPositionChart({ data }: { data: CashPositionPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d + 'T00:00:00'), 'd MMM')} fontSize={11} />
        <YAxis tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} fontSize={11} />
        <Tooltip
          formatter={(v: number) => `${v.toLocaleString('en-IN')} ৳`}
          labelFormatter={(d) => format(new Date(d + 'T00:00:00'), 'EEE d MMM yyyy')}
        />
        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
        <Area type="monotone" dataKey="balance" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.3} strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
