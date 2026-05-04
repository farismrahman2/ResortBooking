'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Save, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { upsertSetting } from '@/lib/actions/settings'

interface Props {
  currentTotalRooms: string
  inventoryFallback: number
}

export function PropertyForm({ currentTotalRooms, inventoryFallback }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState(currentTotalRooms)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  function save() {
    setError(null)
    const trimmed = value.trim()
    if (trimmed && (!/^\d+$/.test(trimmed) || Number(trimmed) <= 0)) {
      setError('Total rooms must be a positive integer (or blank to use inventory total).')
      return
    }
    startTransition(async () => {
      const r = await upsertSetting('total_rooms', trimmed)
      if (!r.success) { setError(r.error); return }
      setSavedAt(new Date().toLocaleTimeString())
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-700">Total rooms</label>
          <Input
            type="number"
            min={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Inventory total: ${inventoryFallback}`}
          />
        </div>
        <Button type="button" variant="primary" size="md" loading={pending} onClick={save} className="gap-1.5">
          <Save size={14} /> Save
        </Button>
      </div>
      {savedAt && !error && <p className="text-xs text-emerald-600">Saved at {savedAt}</p>}
      {error && (
        <div className="flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
          <AlertCircle size={12} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
    </div>
  )
}
