/**
 * Type "tel", find তেল.
 *
 * Item names are stored as `English / বাংলা`, and the people using this think
 * in Bangla but type on an English keyboard. They know the oil as তেল, not as
 * "Cooking oil", and they cannot type তেল — so the Bangla half of every name,
 * which is the half they actually recognise, was unsearchable.
 *
 * Two passes, because one is never enough:
 *
 *   1. ROMANISE the Bangla into the spelling a Bangladeshi would type —
 *      তেল → "tel", রসুন → "rosun", আলু → "alu". This handles most queries
 *      exactly.
 *   2. Reduce both sides to a CONSONANT SKELETON for everything else. There is
 *      no agreed romanisation: মাছ is typed "mach", "machh" or "maach", and
 *      মাংস is "mangsho" or "mangso". Dropping vowels and collapsing the
 *      aspirate pairs makes all of those the same key.
 *
 * Pass 2 over-matches by design. It is the fallback, ranked below pass 1, in a
 * list of 77 items you are picking from by eye — a couple of extra rows is a
 * far smaller cost than not finding the thing at all.
 */

/** Vowel signs (কার) — these replace the consonant's inherent vowel. */
const VOWEL_SIGNS: Record<string, string> = {
  'া': 'a',   // া
  'ি': 'i',   // ি
  'ী': 'i',   // ী
  'ু': 'u',   // ু
  'ূ': 'u',   // ূ
  'ৃ': 'ri',  // ৃ
  'ে': 'e',   // ে
  'ৈ': 'oi',  // ৈ
  'ো': 'o',   // ো
  'ৌ': 'ou',  // ৌ
}

/** Independent vowels — these carry their own sound. */
const VOWELS: Record<string, string> = {
  'অ': 'o',   // অ
  'আ': 'a',   // আ
  'ই': 'i',   // ই
  'ঈ': 'i',   // ঈ
  'উ': 'u',   // উ
  'ঊ': 'u',   // ঊ
  'ঋ': 'ri',  // ঋ
  'এ': 'e',   // এ
  'ঐ': 'oi',  // ঐ
  'ও': 'o',   // ও
  'ঔ': 'ou',  // ঔ
}

const CONSONANTS: Record<string, string> = {
  'ক': 'k',  'খ': 'kh', 'গ': 'g',  'ঘ': 'gh', 'ঙ': 'ng',
  'চ': 'ch', 'ছ': 'chh','জ': 'j',  'ঝ': 'jh', 'ঞ': 'n',
  'ট': 't',  'ঠ': 'th', 'ড': 'd',  'ঢ': 'dh', 'ণ': 'n',
  'ত': 't',  'থ': 'th', 'দ': 'd',  'ধ': 'dh', 'ন': 'n',
  'প': 'p',  'ফ': 'ph', 'ব': 'b',  'ভ': 'bh', 'ম': 'm',
  'য': 'j',  'র': 'r',  'ল': 'l',
  'শ': 'sh', 'ষ': 'sh', 'স': 's',  'হ': 'h',
  'ড়': 'r',  'ঢ়': 'rh', 'য়': 'y',
  'ৎ': 't',  // ৎ
}

const HASANT = '্'          // ্ — kills the inherent vowel
const CHANDRABINDU = 'ঁ'    // ঁ — nasalisation, carries no letter
const ANUSVARA = 'ং'        // ং
const VISARGA = 'ঃ'         // ঃ

const BANGLA_DIGITS = '০১২৩৪৫৬৭৮৯'

/**
 * ড় ঢ় য় are usually stored DECOMPOSED — a base consonant followed by the
 * nukta U+09BC — and Unicode normalisation will not put them back together
 * (they are composition exclusions). Left alone, মিষ্টি কুমড়া romanises with a
 * stray combining mark in the middle and stops matching anything.
 */
const NUKTA = '\u09BC'

/** Base consonant + nukta → the sound it makes. Keys are single codepoints. */
const NUKTA_LATIN: Record<string, string> = {
  '\u09A1': 'r',   // ড + ় = ড়
  '\u09A2': 'rh',  // ঢ + ় = ঢ়
  '\u09AF': 'y',   // য + ় = য়
}

/**
 * Bangla → the Latin spelling someone would actually type.
 *
 * The fiddly part is the inherent vowel: a bare consonant carries an implied
 * 'o'. রসুন is "rosun", not "rsun". But it goes silent at the end of a word —
 * তেল is "tel", not "telo" — so it is added everywhere except word-final
 * position. That single rule gets the vast majority of food words right.
 */
export function banglaToLatin(input: string): string {
  const chars = [...input]
  let out = ''

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]

    if (VOWELS[c])      { out += VOWELS[c]; continue }
    if (VOWEL_SIGNS[c]) { out += VOWEL_SIGNS[c]; continue }
    if (c === CHANDRABINDU) continue
    if (c === ANUSVARA) { out += 'ng'; continue }
    if (c === VISARGA)  { out += 'h';  continue }
    if (c === HASANT)   continue
    if (BANGLA_DIGITS.includes(c)) { out += String(BANGLA_DIGITS.indexOf(c)); continue }

    // A following nukta changes the sound. Handled by peeking rather than by
    // pre-composing, because the precomposed glyphs are composition exclusions
    // that normalisation will not produce and that source files store
    // inconsistently — comparing them by literal is a trap.
    const hasNukta = chars[i + 1] === NUKTA
    const cons = hasNukta ? NUKTA_LATIN[c] ?? CONSONANTS[c] : CONSONANTS[c]
    if (!cons) { if (c !== NUKTA) out += c; continue }
    out += cons
    if (hasNukta) i++

    // Inherent vowel: implied unless a vowel sign, a hasant (conjunct) or the
    // end of the word follows.
    const next = chars[i + 1]
    const atWordEnd = next === undefined || /[\s/,.\-()]/.test(next)
    const suppressed = next !== undefined
      && (VOWEL_SIGNS[next] !== undefined || next === HASANT
        || next === CHANDRABINDU || next === ANUSVARA || next === VISARGA)
    if (!atWordEnd && !suppressed) out += 'o'
  }

  return out
}

/**
 * The fuzzy key: consonants only, aspirates collapsed.
 *
 * Applied to BOTH the romanised name and the typed query, so "mach", "machh"
 * and "maach" all reduce to the same thing — which is the point, because
 * nobody agrees on how to spell Bangla in Latin letters and they are not going
 * to start agreeing at 6am.
 *
 * Longest-first replacement matters: "mangsho" must see "ng" before "g".
 */
const DIGRAPHS: Array<[RegExp, string]> = [
  [/chh/g, 'c'], [/ch/g, 'c'],
  [/sh/g, 's'],  [/ss/g, 's'],
  [/kh/g, 'k'],  [/gh/g, 'g'], [/ng/g, 'n'],
  [/th/g, 't'],  [/dh/g, 'd'],
  [/ph/g, 'f'],  [/bh/g, 'b'], [/jh/g, 'j'], [/rh/g, 'r'],
]

export function phoneticKey(input: string): string {
  let s = input.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const [re, to] of DIGRAPHS) s = s.replace(re, to)
  // Latin spellings people actually use for the same sounds.
  s = s.replace(/z/g, 'j').replace(/v/g, 'b').replace(/q/g, 'k').replace(/x/g, 'ks')
  // Vowels carry almost no information once romanisation is this loose, and
  // they are where the disagreement lives.
  s = s.replace(/[aeiouwyh]/g, '')
  // "chh" → "cc" → "c": collapse anything doubled by the reductions above.
  s = s.replace(/(.)\1+/g, '$1')
  return s
}

/**
 * Vowel-insensitive form: every vowel becomes the same letter, runs collapse.
 *
 * Sits between the exact romanisation and the consonant skeleton. "aloo" is by
 * far the commonest way people write আলু, whose romanisation is "alu" — the
 * substring tiers miss it on one vowel, and the skeleton tier can't save it
 * because dropping the vowels from a three-letter word leaves "l", which is
 * too short to be allowed to match anything.
 *
 * Folding rather than deleting keeps the shape of the word, so it stays far
 * more precise than the skeleton while forgiving exactly the disagreement that
 * romanised Bangla is full of.
 */
export function vowelFold(input: string): string {
  let s = input.toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const [re, to] of DIGRAPHS) s = s.replace(re, to)
  // h, w and y written on their own are hiatus, not sound: people spell দই
  // ("doi") as "dohi" and দুধ as "dudh". The digraphs are already collapsed by
  // this point, so nothing meaningful is lost.
  s = s.replace(/[hwy]/g, '')
  s = s.replace(/[aeiou]/g, 'a')
  return s.replace(/(.)\1+/g, '$1')
}

/** Does this string contain Bengali script? */
export function hasBengali(input: string): boolean {
  return /[\u0980-\u09FF]/.test(input)
}
