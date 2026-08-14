/**
 * Kitchen items carry both names in one column: `English / বাংলা`.
 *
 * The store hands the printed requisition to a supplier who reads Bangla and
 * files it against an English inventory code, so both have to sit on the same
 * line. The seeded catalogue already uses this exact shape, and the vendor
 * WhatsApp messages echo `item_name` verbatim — so rather than splitting the
 * column in two (and rewriting every message builder, the seed, and 77 live
 * rows), the pair is joined on ` / ` and split back apart for editing.
 */

export const NAME_SEPARATOR = ' / '

/** `('Pumpkin', 'মিষ্টি কুমড়া')` → `'Pumpkin / মিষ্টি কুমড়া'`. */
export function joinItemName(en: string, bn: string): string {
  const e = en.trim()
  const b = bn.trim()
  if (!e) return b
  if (!b) return e
  return `${e}${NAME_SEPARATOR}${b}`
}

/**
 * Inverse of joinItemName. Splits on the FIRST separator only — a name like
 * `Chicken / মুরগি / ব্রয়লার` keeps the tail with the Bangla half rather than
 * silently dropping it.
 *
 * A name with no separator is treated as English, which is what the handful of
 * items added before this existed look like.
 */
export function splitItemName(name: string): { en: string; bn: string } {
  const at = name.indexOf(NAME_SEPARATOR)
  if (at === -1) return { en: name.trim(), bn: '' }
  return {
    en: name.slice(0, at).trim(),
    bn: name.slice(at + NAME_SEPARATOR.length).trim(),
  }
}
