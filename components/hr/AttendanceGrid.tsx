'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import {
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_STATUS_BADGE,
  DEPARTMENT_LABELS,
} from '@/components/hr/labels'
import { markAttendance, bulkMarkAttendance } from '@/lib/actions/attendance'
import type {
  AttendanceRow,
  AttendanceStatus,
  LeaveTypeRow,
  EmployeeRow,
} from '@/lib/supabase/types'

type EmployeeForGrid = Pick<EmployeeRow,
  'id' | 'employee_code' | 'full_name' | 'designation' | 'department' | 'is_live_in'>

interface Props {
  date:         string
  employees:    EmployeeForGrid[]
  attendance:   Record<string, AttendanceRow>
  leaveTypes:   LeaveTypeRow[]
}

const STATUSES: AttendanceStatus[] = [
  'present', 'absent', 'paid_leave', 'unpaid_leave', 'weekly_off', 'holiday', 'half_day',
]

interface LocalEntry {
  status:        AttendanceStatus | ''
  leave_type_id: string | null
}

export function AttendanceGrid({ date, employees, attendance, leaveTypes }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // Local working state per employee — pre-populated from existing attendance
  const initialEntries: Record<string, LocalEntry> = useMemo(() => {
    const m: Record<string, LocalEntry> = {}
    for (const e of employees) {
      const a = attendance[e.id]
      m[e.id] = {
        status:        a?.status ?? '',
        leave_type_id: a?.leave_type_id ?? null,
      }
    }
    return m
  }, [employees, attendance])

  const [entries, setEntries] = useState<Record<string, LocalEntry>>(initialEntries)

  function setStatus(empId: string, status: AttendanceStatus) {
    setEntries((p) => ({
      ...p,
      [empId]: {
        status,
        // Clear leave type if no longer paid/unpaid leave; default to first paid type otherwise
        leave_type_id: (status === 'paid_leave' || status === 'unpaid_leave')
          ? (p[empId]?.leave_type_id ?? leaveTypes[0]?.id ?? null)
          : null,
      },
    }))
  }

  function setLeaveType(empId: string, ltId: string) {
    setEntries((p) => ({
      ...p,
      [empId]: { ...p[empId], leave_type_id: ltId || null },
    }))
  }

  function markAllPresent() {
    setEntries((p) => {
      const next = { ...p }
      for (const e of employees) {
        next[e.id] = { status: 'present', leave_type_id: null }
      }
      return next
    })
  }

  function saveSingle(empId: string) {
    const entry = entries[empId]
    if (!entry?.status) return
    setError(null)
    startTransition(async () => {
      const r = await markAttendance({
        employee_id:   empId,
        date,
        status:        entry.status,
        leave_type_id: entry.leave_type_id,
      })
      if (!r.success) { setError(r.error); return }
      setSavedAt(new Date().toLocaleTimeString())
      router.refresh()
    })
  }

  function saveAll() {
    setError(null)
    const filled = employees
      .map((e) => ({
        employee_id:   e.id,
        status:        entries[e.id]?.status,
        leave_type_id: entries[e.id]?.leave_type_id ?? null,
      }))
      .filter((e): e is { employee_id: string; status: AttendanceStatus; leave_type_id: string | null } =>
        !!e.status,
      )
    if (filled.length === 0) { setError('Set a status on at least one employee.'); return }
    startTransition(async () => {
      const r = await bulkMarkAttendance({ date, entries: filled })
      if (!r.success) { setError(r.error); return }
      setSavedAt(new Date().toLocaleTimeString())
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={markAllPresent}>
            Mark all Present
          </Button>
          {savedAt && !error && (
            <span className="text-xs text-emerald-600">Saved at {savedAt}</span>
          )}
        </div>
        <Button type="button" variant="primary" size="md" loading={pending} onClick={saveAll}>
          Save All
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Department</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Leave Type</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map((e) => {
                const entry = entries[e.id] ?? { status: '', leave_type_id: null }
                const showLeaveType = entry.status === 'paid_leave' || entry.status === 'unpaid_leave'
                return (
                  <tr key={e.id}>
                    <td className="px-3 py-2 align-top">
                      <p className="font-medium text-gray-900">{e.full_name}</p>
                      <p className="text-xs text-gray-500">{e.employee_code} · {e.designation}</p>
                    </td>
                    <td className="px-3 py-2 align-top text-xs text-gray-600">
                      {DEPARTMENT_LABELS[e.department]}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {STATUSES.map((s) => {
                          const isActive = entry.status === s
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setStatus(e.id, s)}
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                                isActive
                                  ? ATTENDANCE_STATUS_BADGE[s]
                                  : 'border-gray-200 bg-white text-gray-500 hover:border-sky-300 hover:text-sky-700'
                              }`}
                            >
                              {ATTENDANCE_STATUS_LABELS[s]}
                            </button>
                          )
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top w-44">
                      {showLeaveType ? (
                        <Select
                          value={entry.leave_type_id ?? ''}
                          onChange={(ev) => setLeaveType(e.id, ev.target.value)}
                        >
                          <option value="">—</option>
                          {leaveTypes.map((lt) => (
                            <option key={lt.id} value={lt.id}>{lt.name}</option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!entry.status || pending}
                        onClick={() => saveSingle(e.id)}
                      >
                        Save row
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
