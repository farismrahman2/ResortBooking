'use client'

import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { format } from 'date-fns'
import type { DailyIncomeRow } from '@/lib/queries/reports/income'

interface Props { data: DailyIncomeRow[] }

export function IncomeTrendChart({ data }: Props) {
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
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area type="monotone" name="Room"   dataKey="room_revenue"   stackId="1" stroke="#4f46e5" fill="#6366f1" fillOpacity={0.7} />
        <Area type="monotone" name="Extras" dataKey="extras_revenue" stackId="1" stroke="#a78bfa" fill="#c4b5fd" fillOpacity={0.7} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
