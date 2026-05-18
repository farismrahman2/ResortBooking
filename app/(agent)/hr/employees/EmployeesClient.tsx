'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DEPARTMENT_OPTIONS } from '@/components/hr/labels'

interface Props {
  search:     string
  department: string
  showTerminated: boolean
}

export function EmployeesFilterBar({ search, department, showTerminated }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  function update(name: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(name, value)
    else       params.delete(name)
    startTransition(() => {
      router.replace(`/hr/employees?${params.toString()}`)
    })
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-gray-200 bg-white p-3">
      <Input
        placeholder="Search by name, code, phone, designation…"
        defaultValue={search}
        onChange={(e) => update('search', e.target.value)}
      />
      <Select
        value={department}
        onChange={(e) => update('department', e.target.value)}
      >
        <option value="">All departments</option>
        {DEPARTMENT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
      <label className="inline-flex items-center gap-2 text-sm text-gray-700 px-3 py-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
          checked={showTerminated}
          onChange={(e) => update('showTerminated', e.target.checked ? '1' : '')}
        />
        Show terminated / resigned
      </label>
    </div>
  )
}
