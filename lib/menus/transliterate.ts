/**
 * Phonetic Bangla → Latin transliteration for dish-catalog search, so a
 * kitchen user on an English keyboard can find কলা by typing "kola",
 * আলু by "alu", মাছ by "mach", etc.
 *
 * Deterministic and lossy by design — it produces the natural romanization
 * (inherent vowel ô → "o", dropped at word end) rather than a reversible
 * scheme. English loanwords stored in Bangla script (স্যান্ডউইচ) romanize
 * approximately; native words match reliably. Pure functions, unit-tested.
 *
 * Uses explicit \u code points throughout so the maps are unambiguous
 * regardless of how Bangla glyphs render in an editor.
 */

const CONSONANTS: Record<string, string> = {
  'ক': 'k',  'খ': 'kh', 'গ': 'g',  'ঘ': 'gh', 'ঙ': 'ng',
  'চ': 'ch', 'ছ': 'chh','জ': 'j',  'ঝ': 'jh', 'ঞ': 'n',
  'ট': 't',  'ঠ': 'th', 'ড': 'd',  'ঢ': 'dh', 'ণ': 'n',
  'ত': 't',  'থ': 'th', 'দ': 'd',  'ধ': 'dh', 'ন': 'n',
  'প': 'p',  'ফ': 'f',  'ব': 'b',  'ভ': 'bh', 'ম': 'm',
  'য': 'j',  'র': 'r',  'ল': 'l',  'শ': 'sh', 'ষ': 'sh',
  'স': 's',  'হ': 'h',
  'ড়': 'r',  'ঢ়': 'rh', 'য়': 'y',  'ৎ': 't',   // ড় ঢ় য় ৎ
}

const IND_VOWELS: Record<string, string> = {
  'অ': 'o',  'আ': 'a',  'ই': 'i',  'ঈ': 'i',
  'উ': 'u',  'ঊ': 'u',  'ঋ': 'ri',
  'এ': 'e',  'ঐ': 'oi', 'ও': 'o',  'ঔ': 'ou',
}

const MATRAS: Record<string, string> = {
  'া': 'a',  'ি': 'i',  'ী': 'i',  'ু': 'u',  'ূ': 'u',
  'ৃ': 'ri', 'ে': 'e',  'ৈ': 'oi', 'ো': 'o',  'ৌ': 'ou',
}

const HASANT      = '্'  // virama — suppresses inherent vowel, forms conjuncts
const NUKTA       = '়'
const CHANDRABINDU = 'ঁ'
const ANUSVARA    = 'ং'  // ং
const VISARGA     = 'ঃ'  // ঃ

// ড়/ঢ়/য় are Unicode composition exclusions — NFC keeps them decomposed as
// base + nukta. Recompose to the precomposed forms the map knows.
function recomposeNukta(s: string): string {
  return s
    .replace(new RegExp('ড়', 'g'), 'ড়')
    .replace(new RegExp('ঢ়', 'g'), 'ঢ়')
    .replace(new RegExp('য়', 'g'), 'য়')
}

/** Transliterate a Bangla (or mixed) string to a lowercase phonetic Latin form.
 *  Non-Bangla characters (Latin letters, digits, spaces, punctuation) pass
 *  through so mixed names stay searchable.
 *
 *  `dropInherent` omits the medial inherent vowel ô, giving the terser form
 *  people often type (firni, murgi) alongside the full form (fironi, murogir).
 */
export function transliterateBanglaToLatin(input: string, dropInherent = false): string {
  const chars = Array.from(recomposeNukta(input.normalize('NFC')))
  let out = ''

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const next = chars[i + 1]

    if (CONSONANTS[ch] !== undefined) {
      out += CONSONANTS[ch]
      if (next === HASANT) { i++; continue }                       // conjunct — no vowel
      if (next && MATRAS[next] !== undefined) { out += MATRAS[next]; i++; continue }
      // Inherent vowel ô only mid-word (another Bangla letter follows); dropped word-final
      if (!dropInherent && next && (CONSONANTS[next] !== undefined || IND_VOWELS[next] !== undefined)) out += 'o'
      continue
    }

    if (IND_VOWELS[ch] !== undefined) { out += IND_VOWELS[ch]; continue }
    if (MATRAS[ch] !== undefined)     { out += MATRAS[ch]; continue }   // stray matra
    if (ch === ANUSVARA)  { out += 'ng'; continue }
    if (ch === VISARGA)   { out += 'h'; continue }
    if (ch === CHANDRABINDU || ch === NUKTA || ch === HASANT) continue

    out += ch                                                            // latin/digit/space/punct
  }

  return out.toLowerCase()
}

/** True if a dish name matches the query directly (Bangla substring) or via
 *  either romanization — the full form (with inherent vowels) or the reduced
 *  form (without) — so both "fironi" and "firni" find ফিরনি. Empty matches all. */
export function dishSearchMatches(name: string, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true
  if (name.toLowerCase().includes(q)) return true
  if (transliterateBanglaToLatin(name, false).includes(q)) return true
  return transliterateBanglaToLatin(name, true).includes(q)
}
