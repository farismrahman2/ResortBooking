'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { startCount } from '@/lib/actions/inventory'
import type { InvStore, InvCategory } from '@/lib/supabase/types-inventory'

interface Props {
  stores:     InvStore[]
  categories: InvCategory[]   // all categories; filtered client-side by store
}

export function CountForm({ stores, categories }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [storeId, setStoreId] = useState(stores[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState('')
  const [notes, setNotes] = useState('')

  const storeCats = useMemo(() => categories.filter((c) => c.store_id === storeId), [categories, storeId])

  function submit() {
    setError(null)
    startTransition(async () => {
      const res = await startCount({ store_id: storeId, category_id: categoryId || null, notes: notes.trim() || null })
      if (!res.success) { setError(res.error); return }
      router.push(`/inventory/counts/${res.data.id}`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <Select label="Store" value={storeId} onChange={(e) => { setStoreId(e.target.value); setCategoryId('') }} required
        options={stores.map((s) => ({ value: s.id, label: s.display_name }))} />
      <Select label="Category (optional — leave blank for whole store)" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
        <option value="">All categories</option>
        {storeCats.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
      </Select>
      <Textarea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <p className="text-xs text-gray-500">
        Starting a count snapshots current system stock for every active item in scope. You then enter physical counts and finalize to auto-generate a recount adjustment for any variances.
      </p>
      <div className="flex gap-2">
        <Button onClick={submit} loading={pending} disabled={!storeId}>Start count</Button>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  )
}
