'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { itemKey, rateJump } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'
import { fmtDay } from './ui'

/**
 * Pick lists for the landscaping forms: people, work categories and items
 * with their last rate. Each form remembers the last choice on this phone so
 * the usual answer is already selected next time.
 */

export type PersonOpt = { id: string; name: string; designation?: string | null }
export type CategoryOpt = { id: string; name: string }
export type ItemSuggestion = { description: string; unit: string | null; rate: number; date: string }

const OTHER = '__other'

export function recall(key: string): string | null {
  try { return window.localStorage.getItem(`ls.pick.${key}`) } catch { return null }
}
export function remember(key: string, value: string | null | undefined) {
  try { if (value) window.localStorage.setItem(`ls.pick.${key}`, value) } catch { /* private mode */ }
}

/** Use the remembered choice when the form starts empty and it is still on the list. */
export function useRememberedPick(key: string, value: string, set: (v: string) => void, allowed: string[], fallback?: string) {
  useEffect(() => {
    if (value) return
    const saved = recall(key)
    if (saved && allowed.includes(saved)) set(saved)
    else if (fallback) set(fallback)
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** A person from the list, or someone typed in. value = person id, or '' with a typed name. */
export function PersonPick({ label, people, personId, name, onChange, rememberKey, fallbackName, placeholder, error }: {
  label: string; people: PersonOpt[]; personId: string; name: string
  onChange: (v: { personId: string; name: string }) => void
  rememberKey: string; fallbackName?: string; placeholder?: string; error?: string
}) {
  const [typing, setTyping] = useState(!personId && !!name)
  useEffect(() => {
    if (personId || name) return
    const saved = recall(rememberKey)
    const match = (n?: string) => people.find((p) => n && p.name.toLowerCase() === n.trim().toLowerCase())
    if (saved && people.some((p) => p.id === saved)) onChange({ personId: saved, name: '' })
    else if (match(fallbackName)) onChange({ personId: match(fallbackName)!.id, name: '' })
    else if (fallbackName) { setTyping(true); onChange({ personId: '', name: fallbackName }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="space-y-2">
      <Select label={label} error={typing ? undefined : error} value={typing ? OTHER : personId}
        onChange={(e) => {
          if (e.target.value === OTHER) { setTyping(true); onChange({ personId: '', name: '' }) }
          else { setTyping(false); onChange({ personId: e.target.value, name: '' }) }
        }}>
        <option value="">— Choose —</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.designation ? ` (${p.designation})` : ''}</option>)}
        <option value={OTHER}>Someone else (type the name)…</option>
      </Select>
      {typing && <Input aria-label={`${label} — name`} placeholder={placeholder ?? 'Type the name'} value={name} error={error} onChange={(e) => onChange({ personId: '', name: e.target.value })} />}
    </div>
  )
}

export function CategoryPick({ categories, value, onChange, rememberKey, label = 'Work category', hint, error }: {
  categories: CategoryOpt[]; value: string; onChange: (id: string) => void; rememberKey: string; label?: string; hint?: string; error?: string
}) {
  useRememberedPick(rememberKey, value, onChange, categories.map((c) => c.id))
  return (
    <Select label={label} hint={hint} error={error} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Choose category —</option>
      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </Select>
  )
}

/** Look up the last unit and rate for what was typed in the item box. */
export function findSuggestion(list: ItemSuggestion[], description: string) {
  const k = itemKey(description)
  return k ? list.find((s) => itemKey(s.description) === k) ?? null : null
}

export function ItemDatalist({ list }: { list: ItemSuggestion[] }) {
  return <datalist id="ls-items">{list.map((s) => <option key={s.description} value={s.description}>{`${s.unit ?? ''} · Tk ${s.rate}`}</option>)}</datalist>
}

/** Last time's rate under an item line, and a warning when this one is much higher. */
export function RateHint({ list, description, rate }: { list: ItemSuggestion[]; description: string; rate: string }) {
  const s = findSuggestion(list, description)
  if (!s) return null
  const jump = rateJump(Number(rate), s.rate)
  return (
    <p className={`col-span-12 text-xs ${jump ? 'font-semibold text-red-600' : 'text-gray-500'}`}>
      {jump && <AlertTriangle size={11} className="mr-1 inline" />}
      Last time {formatBDT(s.rate)}{s.unit ? ` / ${s.unit}` : ''} ({fmtDay(s.date)}){jump ? ` — this rate is ${jump}% higher` : ''}
    </p>
  )
}
