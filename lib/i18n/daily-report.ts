import type { PackageType, RoomType } from '@/lib/supabase/types'

export type Lang = 'en' | 'bn'

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯']

/** Convert ASCII digits in a string/number to Bangla numerals (০-৯). */
export function toBnDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)])
}

/** Localise a number — Bangla digits if lang=bn, otherwise as-is. */
export function fmtNum(n: number | string, lang: Lang): string {
  return lang === 'bn' ? toBnDigits(n) : String(n)
}

interface Dict {
  // page
  title:           string
  // table headers
  col_name:        string
  col_package:     string
  col_guests:      string
  col_meals:       string
  col_rooms:       string
  // package types
  pkg_daylong:     string
  pkg_night:       string
  // meals (column abbreviations)
  meal_breakfast:  string
  meal_lunch:      string
  meal_dinner:     string
  meal_snacks:     string
  // guest detail labels
  adults_short:    string   // e.g. "জন" / "guests"
  children:        string
  drivers:         string
  // free rooms section
  free_rooms:      string
  after_noon:      string   // "১২ টার পর" / "After 12 PM"
  after_6pm:       string   // "৬ টার পর" / "After 6 PM"
  // totals row
  total:           string
  adults_label:    string
  download:        string
  print_hint:      string
  // weekdays (Sun=0..Sat=6)
  weekdays:        string[]
  // months (Jan=0..Dec=11)
  months:          string[]
}

export const DICT: Record<Lang, Dict> = {
  en: {
    title:          'Room Allocation',
    col_name:       'Name',
    col_package:    'Package',
    col_guests:     'Guests',
    col_meals:      'Meals',
    col_rooms:      'Rooms',
    pkg_daylong:    'Day Long',
    pkg_night:      'Night Stay',
    meal_breakfast: 'Breakfast',
    meal_lunch:     'Lunch',
    meal_dinner:    'Dinner',
    meal_snacks:    'Snacks',
    adults_short:   'guests',
    children:       'children',
    drivers:        'drivers',
    free_rooms:     'Free Rooms',
    after_noon:     'After 12 PM',
    after_6pm:      'After 6 PM',
    total:          'Total',
    adults_label:   'Adults',
    download:       'Download Room Allocation',
    print_hint:     'Use your browser print dialog to save as PDF.',
    weekdays: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    months:   ['January', 'February', 'March', 'April', 'May', 'June',
               'July', 'August', 'September', 'October', 'November', 'December'],
  },
  bn: {
    title:          'রুম বন্টন',
    col_name:       'নাম',
    col_package:    'প্যাকেজ',
    col_guests:     'গেস্ট সংখ্যা',
    col_meals:      'খাবার',
    col_rooms:      'রুম',
    pkg_daylong:    'ডে লং',
    pkg_night:      'নাইট স্টে',
    meal_breakfast: 'সকাল',
    meal_lunch:     'দুপুর',
    meal_dinner:    'রাত',
    meal_snacks:    'বিকাল',
    adults_short:   'জন',
    children:       'শিশু',
    drivers:        'ড্রাইভার',
    free_rooms:     'রুম ফ্রী',
    after_noon:     '১২ টার পর',
    after_6pm:      '৬ টার পর',
    total:          'মোট',
    adults_label:   'প্রাপ্তবয়স্ক',
    download:       'রুম বন্টন ডাউনলোড',
    print_hint:     'PDF হিসেবে সংরক্ষণ করতে ব্রাউজার প্রিন্ট ডায়ালগ ব্যবহার করুন।',
    weekdays: ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'],
    months:   ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
               'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
  },
}

/** Format an ISO date (YYYY-MM-DD) as "Friday, 15 May 2026" or "শুক্রবার, ১৫ মে ২০২৬" */
export function formatLongDate(iso: string, lang: Lang): string {
  const d = new Date(iso + 'T00:00:00')
  const dict = DICT[lang]
  const weekday = dict.weekdays[d.getDay()]
  const month   = dict.months[d.getMonth()]
  const day     = fmtNum(d.getDate(), lang)
  const year    = fmtNum(d.getFullYear(), lang)
  return `${weekday}, ${day} ${month} ${year}`
}

export function packageLabel(type: PackageType, lang: Lang): string {
  return type === 'daylong' ? DICT[lang].pkg_daylong : DICT[lang].pkg_night
}

/** Display name for a room type in the target language.
 *  Falls back to inventory display_name (Latin) for English; for Bangla we
 *  ship a hand-curated table so the report doesn't print Latin room labels
 *  inside an otherwise-Bangla document. */
const ROOM_TYPE_BN: Record<RoomType, string> = {
  super_premium:   'সুপার প্রিমিয়াম',
  premium:         'প্রিমিয়াম',
  premium_deluxe:  'প্রিমিয়াম ডিলাক্স',
  deluxe:          'ডিলাক্স',
  superior_deluxe: 'সুপিরিয়র ডিলাক্স',
  eco_deluxe:      'ইকো ডিলাক্স',
  cottage:         'কটেজ',
  tree_house:      'ট্রি হাউজ',
}

export function roomTypeLabel(type: RoomType, fallbackEn: string, lang: Lang): string {
  return lang === 'bn' ? (ROOM_TYPE_BN[type] ?? fallbackEn) : fallbackEn
}
