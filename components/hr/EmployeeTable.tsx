import Link from 'next/link'
import { formatBDT } from '@/lib/formatters/currency'
import {
  DEPARTMENT_LABELS,
  EMPLOYMENT_STATUS_BADGE,
  EMPLOYMENT_STATUS_LABELS,
} from '@/components/hr/labels'
import type { EmployeeWithCurrentSalary } from '@/lib/supabase/types'

interface Props {
  rows: EmployeeWithCurrentSalary[]
}

export function EmployeeTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">No employees match these filters.</p>
        <p className="mt-1 text-xs text-gray-500">
          Add a new employee or clear filters to see entries.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Code</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Designation</th>
              <th className="px-4 py-2.5 font-medium">Department</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 text-right font-medium">Gross</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const isInactive = r.employment_status === 'terminated' || r.employment_status === 'resigned'
              return (
                <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-2.5 align-top whitespace-nowrap font-mono text-xs text-gray-500">
                    {r.employee_code}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <Link
                      href={`/hr/employees/${r.id}`}
                      className={`font-medium hover:text-sky-700 ${isInactive ? 'text-gray-400 line-through' : 'text-gray-900'}`}
                    >
                      {r.full_name}
                    </Link>
                    {r.is_live_in && (
                      <span className="ml-2 text-[10px] uppercase font-semibold text-indigo-600">live-in</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 align-top text-gray-700">{r.designation}</td>
                  <td className="px-4 py-2.5 align-top text-xs text-gray-600">
                    {DEPARTMENT_LABELS[r.department]}
                  </td>
                  <td className="px-4 py-2.5 align-top text-xs text-gray-600">{r.phone}</td>
                  <td className="px-4 py-2.5 align-top text-right font-mono tabular-nums text-gray-900">
                    {r.current_salary
                      ? formatBDT(Number(r.current_salary.gross))
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${EMPLOYMENT_STATUS_BADGE[r.employment_status]}`}
                    >
                      {EMPLOYMENT_STATUS_LABELS[r.employment_status]}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
