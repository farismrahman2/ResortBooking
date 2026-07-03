'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { MenuDishRow } from '@/lib/supabase/types-menus'

interface Props {
  onAdd: (text: string, dishCatalogId: string | null) => void
  disabled?: boolean
}

/**
 * Catalog + free-text dish entry. Typing searches the catalog (usage-ranked);
 * tapping a suggestion inserts it, pressing Enter adds whatever was typed as
 * free text. Mobile-first: one input, big touch targets.
 */
export function DishPicker({ onAdd, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<MenuDishRow[]>([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!query.trim()) { setSuggestions([]); return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/menus/dishes?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        if (!res.ok) return
        const json = await res.json()
        setSuggestions(json.dishes ?? [])
        setOpen(true)
      } catch { /* aborted or offline — keep last suggestions */ }
    }, 250)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

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
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFreeText() } }}
          disabled={disabled}
          placeholder="খাবার লিখুন বা খুঁজুন… (dish name)"
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
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
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
