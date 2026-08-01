'use client'

import { AlertTriangle, Pencil } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface Props {
  open:      boolean
  /** Room numbers that were taken by another booking before this convert. */
  rooms:     string[]
  onCancel:  () => void
  /** Navigate to the quote's edit page to re-pick rooms. */
  onEdit:    () => void
  pending?:  boolean
}

export function RoomConflictModal({ open, rooms, onCancel, onEdit, pending }: Props) {
  const many = rooms.length > 1
  return (
    <Modal open={open} onClose={onCancel} title="Room No Longer Available" size="md">
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-900">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>
            Room {many ? 'numbers' : 'number'}{' '}
            <strong className="font-mono">{rooms.join(', ')}</strong>{' '}
            {many ? 'were' : 'was'} booked by someone else while this quote was open,
            so it can&apos;t be confirmed as-is.
          </span>
        </div>

        <p className="text-sm text-gray-700">
          Open the quote for editing to pick {many ? 'different rooms' : 'a different room'} —
          the taken {many ? 'rooms' : 'room'} will show in red. After re-picking and saving,
          confirm again.
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
          <Button type="button" variant="outline" size="md" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="primary" size="md" loading={pending} onClick={onEdit} className="gap-1.5">
            <Pencil size={14} /> Edit quote to re-pick rooms
          </Button>
        </div>
      </div>
    </Modal>
  )
}
