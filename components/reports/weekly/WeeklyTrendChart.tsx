'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from 'recharts'

export function WeeklyTrendChart({ data }: { data: Array<{ week_label: string; net: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="week_label" fontSize={11} />
        <YAxis tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} fontSize={11} />
        <Tooltip formatter={(v: number) => `${v.toLocaleString('en-IN')} ৳`} />
        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="4 4" />
        <Bar dataKey="net" radius={[4, 4, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.net >= 0 ? '#10b981' : '#e11d48'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
