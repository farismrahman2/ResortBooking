'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea } from 'recharts'
import { format } from 'date-fns'
import type { SalaryVsRevenueRow } from '@/lib/queries/reports/hr'

export function SalaryVsRevenueChart({ data }: { data: SalaryVsRevenueRow[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" tickFormatter={(m) => format(new Date(m + 'T00:00:00'), 'MMM')} fontSize={11} />
        <YAxis tickFormatter={(v) => `${v}%`} fontSize={11} domain={[0, 'auto']} />
        <Tooltip formatter={(v) => v === null || v === undefined ? '—' : `${Number(v).toFixed(1)}%`}
          labelFormatter={(m) => format(new Date(m + 'T00:00:00'), 'MMM yyyy')} />
        <ReferenceArea y1={25} y2={35} fill="#a5b4fc" fillOpacity={0.18} />
        <ReferenceLine y={25} stroke="#6366f1" strokeDasharray="3 3" />
        <ReferenceLine y={35} stroke="#e11d48" strokeDasharray="3 3" />
        <Line type="monotone" dataKey="salary_pct" stroke="#4f46e5" strokeWidth={2} dot connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}
