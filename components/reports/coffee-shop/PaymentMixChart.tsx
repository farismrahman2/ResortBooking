'use client'

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts'

const COLORS = ['#10b981', '#ec4899', '#f97316', '#a855f7', '#0ea5e9', '#64748b', '#a8a29e']

export function PaymentMixChart({ data }: { data: Array<{ method: string; amount: number; pct: number }> }) {
  if (data.length === 0) {
    return <p className="text-center text-sm text-gray-500 py-6">No payments in this period.</p>
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="amount" nameKey="method" innerRadius={50} outerRadius={90} paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: number) => `${v.toLocaleString('en-IN')} ৳`} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
