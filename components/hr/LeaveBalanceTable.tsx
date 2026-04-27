import type { LeaveBalanceWithRefs } from '@/lib/queries/leaves'

interface Props {
  rows: LeaveBalanceWithRefs[]
}

/**
 * Pivots a flat list of leave_balances rows into a per-employee × per-leave-type table.
 * Each cell shows `used / total available`.
 */
export function LeaveBalanceTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">No leave balances initialized for this year.</p>
        <p className="mt-1 text-xs text-gray-500">
          Click &quot;Initialize Year&quot; to seed each active employee × leave type.
        </p>
      </div>
    )
  }

  // Pivot: collect unique leave types in display order, then group by employee.
  const types = Array.from(
    new Map(rows.map((r) => [r.leave_type.id, r.leave_type])).values(),
  ).sort((a, b) => a.name.localeCompare(b.name))

  const empMap = new Map<string, {
    employee: { id: string; full_name: string; employee_code: string }
    cells: Record<string, LeaveBalanceWithRefs>
  }>()
  for (const r of rows) {
    if (!empMap.has(r.employee.id)) {
      empMap.set(r.employee.id, { employee: r.employee, cells: {} })
    }
    empMap.get(r.employee.id)!.cells[r.leave_type.id] = r
  }
  const employees = Array.from(empMap.values()).sort((a, b) =>
    a.employee.full_name.localeCompare(b.employee.full_name),
  )

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 font-medium">Employee</th>
              {types.map((t) => (
                <th key={t.id} className="px-3 py-2 text-right font-medium">
                  {t.name}
                  <p className="text-[9px] font-normal text-gray-400 normal-case">used / available</p>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {employees.map(({ employee, cells }) => (
              <tr key={employee.id}>
                <td className="px-3 py-2">
                  <p className="font-medium text-gray-900">{employee.full_name}</p>
                  <p className="text-xs font-mono text-gray-500">{employee.employee_code}</p>
                </td>
                {types.map((t) => {
                  const cell = cells[t.id]
                  if (!cell) return <td key={t.id} className="px-3 py-2 text-right text-gray-300">—</td>
                  const danger = cell.available <= 0 && cell.leave_type.is_paid
                  return (
                    <td key={t.id} className="px-3 py-2 text-right font-mono tabular-nums text-sm">
                      <span className="text-gray-700">{cell.used.toFixed(1)}</span>
                      <span className="text-gray-300"> / </span>
                      <span className={danger ? 'text-red-700 font-semibold' : 'text-gray-900 font-semibold'}>
                        {cell.available.toFixed(1)}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
