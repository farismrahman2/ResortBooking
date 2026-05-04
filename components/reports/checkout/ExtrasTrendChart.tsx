'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { format } from 'date-fns'

export function ExtrasTrendChart({ data }: { data: Array<{ date: string; total: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="date" tickFormatter={(d) => format(new Date(d + 'T00:00:00'), 'd MMM')} fontSize={11} />
        <YAxis tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} fontSize={11} />
        <Tooltip
          formatter={(v: number) => `${v.toLocaleString('en-IN')} ৳`}
          labelFormatter={(d) => format(new Date(d + 'T00:00:00'), 'EEE d MMM yyyy')}
        />
        <Bar dataKey="total" fill="#7c3aed" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
