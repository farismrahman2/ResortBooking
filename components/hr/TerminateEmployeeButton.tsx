'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { toISODate } from '@/lib/formatters/dates'
import { terminateEmployee, reactivateEmployee } from '@/lib/actions/employees'

interface Props {
  employeeId: string
  isInactive: boolean
}

export function TerminateEmployeeButton({ employeeId, isInactive }: Props) {
  const router  = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [date, setDate]     = useState(toISODate(new Date()))
  const [reason, setReason] = useState('')
  const [status, setStatus] = useState<'terminated' | 'resigned'>('terminated')
  const [error, setError]   = useState<string | null>(null)

  function handleTerminate() {
    setError(null)
    if (!reason.trim()) { setError('Reason is required.'); return }
    startTransition(async () => {
      const result = await terminateEmployee(employeeId, {
        termination_date:   date,
        termination_reason: reason,
        status,
      })
      if (!result.success) { setError(result.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  function handleReactivate() {
    startTransition(async () => {
      const result = await reactivateEmployee(employeeId)
      if (result.success) router.refresh()
    })
  }

  if (isInactive) {
    return (
      <Button variant="outline" size="sm" loading={pending} onClick={handleReactivate}>
        Reactivate
      </Button>
    )
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Terminate / Resign
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Terminate / Resign Employee">
        <div className="space-y-3">
          <Select
            label="Outcome"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'terminated' | 'resigned')}
          >
            <option value="terminated">Terminated</option>
            <option value="resigned">Resigned</option>
          </Select>
          <Input
            label="Effective Date"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Textarea
            label="Reason"
            required
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Required — describe reason for the records."
          />
          <p className="text-xs text-gray-500">
            The currently-effective salary structure will be closed on this date. The
            employee will disappear from the active list (use &quot;Show terminated&quot; to find them).
          </p>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="md" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" variant="danger" size="md" loading={pending} onClick={handleTerminate}>
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
