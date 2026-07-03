'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, BookmarkPlus, FolderOpen, Save, Trash2, X } from 'lucide-react'
import { DishPicker } from './DishPicker'
import { NotesList } from './NotesList'
import { setMealItems, updateMeal, removeMeal, addDishToCatalog, saveMealTemplate } from '@/lib/actions/menus'
import type { MenuTemplateRow } from '@/lib/supabase/types-menus'
import { headcountLine } from '@/lib/menus/headcount-line'
import { toBanglaDigits } from '@/lib/menus/bangla-numerals'
import { cn } from '@/lib/utils'
import type { MenuMealFull } from '@/lib/supabase/types-menus'
import type { DayMealCount } from '@/lib/queries/menus'

interface Props {
  meal:     MenuMealFull
  /** Expected counts for this meal type from the whole day's bookings (null = no basis). */
  calc:     DayMealCount | null
  editable: boolean
  onError:  (msg: string) => void
}

type ItemDraft = { text: string; dish_catalog_id: string | null }

export function MealBlock({ meal, calc, editable, onError }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [items, setItems] = useState<ItemDraft[]>(
    meal.items.map((i) => ({ text: i.text, dish_catalog_id: i.dish_catalog_id })),
  )
  const [servingTime, setServingTime] = useState(meal.serving_time ?? '')
  const [templates, setTemplates] = useState<MenuTemplateRow[] | null>(null)  // null = picker closed
  const [counts, setCounts] = useState({
    total:    meal.headcount_total,
    adults:   meal.headcount_adults,
    children: meal.headcount_children,
    drivers:  meal.headcount_drivers,
  })

  function saveItems(next: ItemDraft[]) {
    setItems(next)
    startTransition(async () => {
      const res = await setMealItems({ meal_id: meal.id, items: next })
      if (!res.success) { onError(res.error); return }
      router.refresh()
    })
  }

  function saveMealMeta(patch: Partial<{ serving_time: string | null } & typeof counts>) {
    startTransition(async () => {
      const res = await updateMeal({
        id: meal.id,
        serving_time:       patch.serving_time !== undefined ? patch.serving_time : undefined,
        headcount_total:    patch.total    !== undefined ? patch.total    : undefined,
        headcount_adults:   patch.adults   !== undefined ? patch.adults   : undefined,
        headcount_children: patch.children !== undefined ? patch.children : undefined,
        headcount_drivers:  patch.drivers  !== undefined ? patch.drivers  : undefined,
      })
      if (!res.success) { onError(res.error); return }
      router.refresh()
    })
  }

  function remove() {
    if (!confirm(`Remove ${meal.meal_type.display_name} from this menu?`)) return
    startTransition(async () => {
      const res = await removeMeal(meal.id)
      if (!res.success) { onError(res.error); return }
      router.refresh()
    })
  }

  function moveItem(from: number, to: number) {
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    saveItems(next)
  }

  function saveToCatalog(index: number) {
    const item = items[index]
    startTransition(async () => {
      const res = await addDishToCatalog(item.text)
      if (!res.success) { onError(res.error); return }
      const next = [...items]
      next[index] = { ...item, dish_catalog_id: res.data.id }
      saveItems(next)
    })
  }

  function saveAsTemplate() {
    const name = prompt('Template name (e.g. স্ট্যান্ডার্ড সকালের নাস্তা):')
    if (!name?.trim()) return
    startTransition(async () => {
      const res = await saveMealTemplate({
        name:         name.trim(),
        meal_type_id: meal.meal_type_id,
        serving_time: servingTime.trim() || null,
        items:        items.filter((i) => i.text.trim()).map((i) => ({ text: i.text })),
      })
      if (!res.success) { onError(res.error); return }
    })
  }

  async function openTemplatePicker() {
    try {
      const res = await fetch(`/api/menus/templates?mealTypeId=${meal.meal_type_id}`)
      const json = res.ok ? await res.json() : { templates: [] }
      setTemplates(json.templates ?? [])
    } catch {
      setTemplates([])
    }
  }

  function loadTemplate(t: MenuTemplateRow) {
    const incoming: ItemDraft[] = (t.items ?? []).map((i) => ({ text: i.text, dish_catalog_id: null }))
    // Append by default; offer replace when the meal already has dishes
    const replace = items.length > 0 && confirm('Replace the current dishes with the template?\nOK = replace · Cancel = append after them')
    setTemplates(null)
    saveItems(replace ? incoming : [...items, ...incoming])
  }

  const previewLine = headcountLine(meal.meal_type.display_name, servingTime.trim() || null, counts)

  return (
    <div className="rounded-xl border border-orange-200 bg-white overflow-hidden">
      {/* Meal header */}
      <div className="flex items-center justify-between border-b border-orange-100 bg-orange-50 px-4 py-2.5">
        <p className="font-semibold text-orange-900">{meal.meal_type.display_name}</p>
        {editable && (
          <button
            onClick={remove}
            disabled={pending}
            className="rounded-lg p-1.5 text-orange-400 hover:bg-orange-100 hover:text-red-600"
            aria-label="Remove meal"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <div className="space-y-4 p-4">
        {/* Serving time + headcounts */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="col-span-2 sm:col-span-1">
            <label className="field-label">Serving time</label>
            <input
              value={servingTime}
              onChange={(e) => setServingTime(e.target.value)}
              onBlur={() => saveMealMeta({ serving_time: servingTime.trim() || null })}
              disabled={!editable}
              placeholder="সকাল ৮:৩০ – ৯:০০"
              className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:bg-gray-50"
            />
          </div>
          {([
            ['total',    'মোট (জন)'],
            ['adults',   'প্রাপ্তবয়স্ক'],
            ['children', 'শিশু'],
            ['drivers',  'ড্রাইভার'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={counts[key] ?? ''}
                onChange={(e) => setCounts((c) => ({ ...c, [key]: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))}
                onBlur={() => saveMealMeta({ [key]: counts[key] } as Partial<typeof counts>)}
                disabled={!editable}
                className="w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm tabular-nums focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200 disabled:bg-gray-50"
              />
            </div>
          ))}
        </div>

        {/* Live preview of the printed headcount line */}
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm font-semibold text-gray-800">{previewLine}</p>

        {/* Day-calculation hint — bookings may have changed since the meal was added */}
        {editable && calc && calc.total > 0 &&
          (calc.total !== (counts.total ?? -1) || calc.adults !== (counts.adults ?? -1)) && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <span>
              বুকিং অনুযায়ী: মোট {toBanglaDigits(calc.total)} · প্রাপ্তবয়স্ক {toBanglaDigits(calc.adults)} ·
              শিশু {toBanglaDigits(calc.children)} · ড্রাইভার {toBanglaDigits(calc.drivers)}
            </span>
            <button
              onClick={() => {
                const next = { total: calc.total, adults: calc.adults, children: calc.children, drivers: calc.drivers }
                setCounts(next)
                saveMealMeta(next)
              }}
              disabled={pending}
              className="rounded border border-orange-200 px-2 py-0.5 font-medium text-orange-700 hover:bg-orange-50"
            >
              Apply
            </button>
          </div>
        )}

        {/* Dish list */}
        <div className="space-y-1.5">
          {items.length === 0 && (
            <p className="text-xs text-gray-400">No dishes yet{editable ? ' — add below.' : '.'}</p>
          )}
          {items.map((item, i) => (
            <div key={`${i}-${item.text}`} className="flex items-center gap-1.5">
              <input
                value={item.text}
                onChange={(e) => {
                  const next = [...items]
                  // Editing the text detaches any catalog link — text is what prints
                  next[i] = { text: e.target.value, dish_catalog_id: null }
                  setItems(next)
                }}
                onBlur={() => saveItems(items.filter((it) => it.text.trim()))}
                disabled={!editable}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-200 disabled:bg-gray-50 disabled:border-transparent"
              />
              {editable && (
                <>
                  {!item.dish_catalog_id && item.text.trim() && (
                    <button
                      title="+ Add to catalog"
                      onClick={() => saveToCatalog(i)}
                      disabled={pending}
                      className="flex-shrink-0 rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-orange-50 hover:text-orange-700"
                    >
                      <BookmarkPlus size={14} />
                    </button>
                  )}
                  <button onClick={() => moveItem(i, i - 1)} disabled={pending || i === 0}
                    className="flex-shrink-0 rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-gray-50 disabled:opacity-30" aria-label="Move up">
                    <ArrowUp size={14} />
                  </button>
                  <button onClick={() => moveItem(i, i + 1)} disabled={pending || i === items.length - 1}
                    className="flex-shrink-0 rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-gray-50 disabled:opacity-30" aria-label="Move down">
                    <ArrowDown size={14} />
                  </button>
                  <button onClick={() => saveItems(items.filter((_, j) => j !== i))} disabled={pending}
                    className="flex-shrink-0 rounded-lg border border-gray-200 p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove dish">
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        {editable && (
          <>
            <DishPicker
              disabled={pending}
              onAdd={(text, dishCatalogId) => saveItems([...items, { text, dish_catalog_id: dishCatalogId }])}
            />
            <div className="flex flex-wrap gap-2">
              <button
                onClick={openTemplatePicker}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-orange-50 hover:text-orange-700"
              >
                <FolderOpen size={13} /> Load template
              </button>
              <button
                onClick={saveAsTemplate}
                disabled={pending || items.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-orange-50 hover:text-orange-700 disabled:opacity-40"
              >
                <Save size={13} /> Save as template
              </button>
            </div>
            {templates !== null && (
              <div className="rounded-lg border border-orange-200 p-2 space-y-1">
                {templates.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-gray-400">No templates saved for {meal.meal_type.display_name} yet.</p>
                ) : (
                  templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => loadTemplate(t)}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-orange-50"
                    >
                      <span className="font-medium text-gray-900">{t.name}</span>
                      <span className="ml-2 text-xs text-gray-400">{(t.items ?? []).length} dishes</span>
                    </button>
                  ))
                )}
                <button onClick={() => setTemplates(null)} className="block w-full rounded-lg px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-gray-50">
                  Close
                </button>
              </div>
            )}
          </>
        )}

        {/* Meal-level notes */}
        <NotesList
          menuDayId={meal.menu_day_id}
          mealId={meal.id}
          notes={meal.notes}
          editable={editable}
          onError={onError}
          compact
        />
      </div>

      <div className={cn('h-1 transition-opacity', pending ? 'animate-pulse bg-orange-300' : 'opacity-0')} />
    </div>
  )
}
