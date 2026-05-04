'use client'

import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import type { DowRow } from '@/lib/queries/reports/income'

export function DowChart({ data }: { data: DowRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" fontSize={11} />
        <YAxis yAxisId="left"  tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} fontSize={11} />
        <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={11} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar  yAxisId="left"  dataKey="avg_revenue_per_day" name="Avg revenue / day" fill="#6366f1" radius={[4, 4, 0, 0]} />
        <Line yAxisId="right" dataKey="avg_occupancy_pct"   name="Avg occupancy %"   stroke="#0ea5e9" strokeWidth={2} dot />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
