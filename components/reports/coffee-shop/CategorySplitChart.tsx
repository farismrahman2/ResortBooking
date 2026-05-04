'use client'

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'

export function CategorySplitChart({ data }: { data: Array<{ category: string; revenue: number; pct: number }> }) {
  if (data.length === 0) {
    return <p className="text-center text-sm text-gray-500 py-6">No items in this period.</p>
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 80 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} fontSize={11} />
        <YAxis type="category" dataKey="category" width={120} fontSize={11} />
        <Tooltip formatter={(v: number) => `${v.toLocaleString('en-IN')} ৳`} />
        <Bar dataKey="revenue" fill="#a8a29e" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
