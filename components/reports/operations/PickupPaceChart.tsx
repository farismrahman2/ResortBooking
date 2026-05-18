'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import type { PickupWeekRow } from '@/lib/queries/reports/operations'

export function PickupPaceChart({ data }: { data: PickupWeekRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="week_label" fontSize={11} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} fontSize={11} />
        <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
        <ReferenceLine y={50} stroke="#9ca3af" strokeDasharray="4 4" />
        <Bar dataKey="pct_booked" fill="#6366f1" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
