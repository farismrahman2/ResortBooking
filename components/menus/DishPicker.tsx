'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { MenuDishRow } from '@/lib/supabase/types-menus'

interface Props {
  onAdd: (text: string, dishCatalogId: string | null) => void
  disabled?: boolean
}

/**
 * Catalog + free-text dish entry. Tapping the field opens the dropdown
 * immediately with the most-used dishes (empty query → usage-ranked list);
 * typing filters it. Pressing Enter adds whatever was typed as free text.
 * Mobile-first: one input, big touch targets.
 */
export function DishPicker({ onAdd, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<MenuDishRow[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const fetchSuggestions = useCallback(async (q: string, signal?: AbortSignal) => {
    try {
      const res = await fetch(`/api/menus/dishes?q=${encodeURIComponent(q.trim())}`, { signal })
      if (!res.ok) return
      const json = await res.json()
      setSuggestions(json.dishes ?? [])
    } catch { /* aborted or offline — keep last suggestions */ }
  }, [])

  // Fetch whenever the dropdown is open. Empty query (fresh tap) fires
  // instantly and returns the top dishes; typing debounces to 200ms.
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    const timer = setTimeout(() => fetchSuggestions(query, controller.signal), query.trim() ? 200 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query, open, fetchSuggestions])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function addFreeText() {
    const text = query.trim()
    if (!text) return
    // Exact catalog match by name → link it
    const match = suggestions.find((s) => s.name === text)
    onAdd(text, match?.id ?? null)
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  function addFromCatalog(dish: MenuDishRow) {
    onAdd(dish.name, dish.id)
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="flex gap-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFreeText() } }}
          disabled={disabled}
          placeholder="খাবার বাছুন বা লিখুন… (tap to pick / type)"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm placeholder:text-gray-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:bg-gray-50"
        />
        <button
          type="button"
          onClick={addFreeText}
          disabled={disabled || !query.trim()}
          className="flex-shrink-0 rounded-lg bg-orange-600 px-3 text-white hover:bg-orange-700 disabled:opacity-40"
          aria-label="Add dish"
        >
          <Plus size={18} />
        </button>
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {query.trim() === '' && (
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              জনপ্রিয় খাবার · Most used
            </p>
          )}
          {suggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => addFromCatalog(s)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-orange-50"
            >
              <span className="text-gray-900">{s.name}</span>
              {s.usage_count > 0 && <span className="text-[10px] text-gray-400">×{s.usage_count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
