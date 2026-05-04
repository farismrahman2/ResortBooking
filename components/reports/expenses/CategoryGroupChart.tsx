'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { CategoryGroupRow } from '@/lib/queries/reports/expenses'

export function CategoryGroupChart({ data }: { data: CategoryGroupRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 100 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} fontSize={11} />
        <YAxis type="category" dataKey="group" width={120} fontSize={11} />
        <Tooltip formatter={(v: number) => `${v.toLocaleString('en-IN')} ৳`} />
        <Bar dataKey="total" fill="#e11d48" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
