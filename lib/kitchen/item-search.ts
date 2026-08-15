import { banglaToLatin, phoneticKey, vowelFold, hasBengali } from './bangla-translit'
import { splitItemName } from './item-name'

/**
 * Item search that works the way the people using it actually type.
 *
 * Names are `English / বাংলা`. Staff know the oil as তেল and type on an English
 * keyboard, so before this the half of the name they recognise was the half
 * they could not search. Typing "tel" now finds it.
 *
 * Four tiers, checked in order and ranked in that order:
 *
 *   1. the raw name — English, or Bangla if they have the keyboard
 *   2. the romanised Bangla, matched from the start of a word ("tel" → তেল)
 *   3. the romanised Bangla, matched anywhere
 *   4. the consonant skeleton, which forgives every spelling disagreement
 *
 * Tier 4 over-matches on purpose; it sits last so the precise hits lead. In a
 * 77-item list you pick from by eye, a couple of extra rows costs far less
 * than not finding the thing at all.
 */

export interface SearchableItem {
  id:   string
  name: string
}

export interface SearchIndexEntry {
  /** Lowercased full name, both halves. */
  raw:      string
  /** Bangla half romanised: তেল → "tel". */
  latin:    string
  /** Consonant skeleton of the romanised Bangla AND the English half. */
  key:      string
  /** Vowel-insensitive romanisation — catches "aloo" for আলু ("alu"). */
  fold:     string
}

export type SearchIndex = Map<string, SearchIndexEntry>

/**
 * Built once per item list rather than per keystroke — transliteration is
 * cheap but not free, and this runs on a phone while somebody types.
 */
export function buildSearchIndex(items: SearchableItem[]): SearchIndex {
  const index: SearchIndex = new Map()
  for (const it of items) {
    const { en, bn } = splitItemName(it.name)
    const latin = bn ? banglaToLatin(bn).toLowerCase() : ''
    index.set(it.id, {
      raw:   it.name.toLowerCase(),
      latin,
      // Both halves feed the skeleton: "oil" should still find it when
      // somebody types "ol", and the English name is often the shorter word.
      key:   `${phoneticKey(latin)} ${phoneticKey(en)}`.trim(),
      fold:  `${vowelFold(latin)} ${vowelFold(en)}`.trim(),
    })
  }
  return index
}

/** Higher is better; 0 means no match. */
export function scoreItem(
  entry: SearchIndexEntry | undefined, query: string, queryKey: string,
): number {
  if (!entry) return 0
  if (entry.raw.startsWith(query))            return 100
  if (entry.raw.includes(query))              return 80
  if (entry.latin.startsWith(query))          return 70
  // Word-initial inside the Bangla half: "kumra" in "misti kumora".
  if (entry.latin.includes(` ${query}`))      return 60
  if (entry.latin.includes(query))            return 40
  // Vowel-insensitive before the skeleton: more precise, and it rescues the
  // short names the skeleton tier is forced to refuse.
  const folded = vowelFold(query)
  if (folded.length >= 2 && entry.fold.includes(folded)) return 30
  if (queryKey.length >= 2 && entry.key.includes(queryKey)) return 20
  return 0
}

/**
 * Filter and rank. `exclude` is the set of items already on the sheet — an
 * item you have already added is noise in the picker, not a result.
 */
export function searchItems<T extends SearchableItem>(
  items: T[], index: SearchIndex, rawQuery: string,
  opts: { limit?: number; exclude?: Set<string | null> } = {},
): T[] {
  let query = rawQuery.trim().toLowerCase()
  if (!query) return []
  // Somebody typing on a Bangla keyboard gets the same treatment as somebody
  // typing romanised Bangla: without this, only an exact substring of the
  // stored name matched, so any spelling variant returned nothing at all.
  if (hasBengali(query)) query = banglaToLatin(query).toLowerCase() || query
  const queryKey = phoneticKey(query)
  const exclude = opts.exclude

  const scored: Array<{ item: T; score: number }> = []
  for (const it of items) {
    if (exclude?.has(it.id)) continue
    const score = scoreItem(index.get(it.id), query, queryKey)
    if (score > 0) scored.push({ item: it, score })
  }

  scored.sort((a, b) =>
    b.score - a.score || a.item.name.localeCompare(b.item.name))
  return scored.slice(0, opts.limit ?? 8).map((s) => s.item)
}
