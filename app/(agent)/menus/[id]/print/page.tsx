import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requirePermission } from '@/lib/auth/permissions'
import { getMenuDayFull } from '@/lib/queries/menus'
import { banglaDate, banglaWeekday, toBanglaDigits } from '@/lib/menus/bangla-numerals'
import { headcountLine } from '@/lib/menus/headcount-line'
import { PrintButton } from '@/components/menus/PrintButton'
import type { MenuMealFull, MenuSpecialNoteRow, NoteColor } from '@/lib/supabase/types-menus'

export const dynamic = 'force-dynamic'

const NOTE_COLORS: Record<NoteColor, string> = {
  green: '#15803d',
  blue:  '#1d4ed8',
  red:   '#dc2626',
}

interface PageProps {
  params: { id: string }
}

/**
 * Pixel-faithful A4 Bangla print view of a menu day — the whole point of
 * the module. HTML + @media print (NOT @react-pdf/renderer: it breaks
 * Bangla conjuncts). Chrome's print-to-PDF output is the deliverable.
 * Fonts are self-hosted in /public/fonts — no CDN at print time.
 */
export default async function MenuPrintPage({ params }: PageProps) {
  await requirePermission('menus', 'read')

  const day = await getMenuDayFull(params.id)
  if (!day) notFound()

  const isDraft = day.status === 'draft'

  return (
    <>
      <style>{`
        /* Self-hosted Noto Sans Bengali (variable, Bengali subset) + Latin subset
           for any English/ASCII mixed into dish text. Files in /public/fonts. */
        @font-face {
          font-family: 'Noto Sans Bengali';
          font-style: normal;
          font-weight: 400;
          src: url('/fonts/NotoSansBengali-Regular.woff2') format('woff2');
        }
        @font-face {
          font-family: 'Noto Sans Bengali';
          font-style: normal;
          font-weight: 700;
          src: url('/fonts/NotoSansBengali-Bold.woff2') format('woff2');
        }
        @font-face {
          font-family: 'Noto Sans Bengali';
          font-style: normal;
          font-weight: 400 700;
          src: url('/fonts/NotoSansBengali-Latin.woff2') format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC, U+2122;
        }

        @page { size: A4; margin: 15mm; }

        .menu-doc {
          font-family: 'Noto Sans Bengali', 'SolaimanLipi', sans-serif;
          color: #000;
          max-width: 180mm;
          margin: 0 auto;
          background: white;
          line-height: 1.65;
        }

        .menu-dish-box {
          border: 1px solid #000;
          padding: 6px 12px;
          text-align: justify;
          margin-top: 2px;
        }

        .menu-watermark {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          z-index: 50;
        }
        .menu-watermark span {
          transform: rotate(-30deg);
          font-size: 72px;
          font-weight: 700;
          color: rgba(220, 38, 38, 0.10);
          white-space: nowrap;
        }

        @media print {
          nav, aside, header, .sidebar, [data-sidebar], [data-topbar] {
            display: none !important;
          }
          body { background: white !important; }
          .menu-doc { max-width: none; }
        }
      `}</style>

      {/* Toolbar — screen only */}
      <div className="no-print flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <Link
          href={`/menus/${day.id}`}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to editor
        </Link>
        <span className="text-gray-300">|</span>
        <span className="text-sm text-gray-700">
          {banglaDate(day.menu_date)}
          {isDraft && <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">খসড়া · Draft</span>}
        </span>
        <div className="ml-auto">
          <PrintButton />
        </div>
      </div>

      {/* Draft watermark — the kitchen must not cook from a draft */}
      {isDraft && (
        <div className="menu-watermark" aria-hidden>
          <span>খসড়া (DRAFT)</span>
        </div>
      )}

      {/* ── The document ─────────────────────────────────────────────── */}
      <div className="menu-doc px-6 py-8 sm:px-10">
        {/* Header: date (largest) → weekday → খাবারের মেনু */}
        <div className="text-center">
          <p className="text-[26px] font-bold leading-snug">{banglaDate(day.menu_date)}</p>
          <p className="text-[20px] font-bold leading-snug">{banglaWeekday(day.menu_date)}</p>
          <p className="text-[17px] font-bold leading-snug">খাবারের মেনু</p>
          {day.occasion_note && (
            <p className="mt-1 text-[15px] font-semibold">{day.occasion_note}</p>
          )}
        </div>

        {/* Meals */}
        <div className="mt-5 space-y-4">
          {day.meals.map((meal) => (
            <MealSection key={meal.id} meal={meal} />
          ))}
        </div>

        {/* Day-level notes */}
        {day.day_notes.length > 0 && (
          <div className="mt-5 space-y-1">
            {day.day_notes.map((n) => (
              <NoteLine key={n.id} note={n} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function MealSection({ meal }: { meal: MenuMealFull }) {
  const line = headcountLine(
    meal.meal_type.display_name,
    meal.serving_time ? toBanglaDigits(meal.serving_time) : null,
    {
      total:    meal.headcount_total,
      adults:   meal.headcount_adults,
      children: meal.headcount_children,
      drivers:  meal.headcount_drivers,
    },
  )

  // Welcome drinks with no dish list renders as a single teal line (sample style)
  if (meal.meal_type.slug === 'welcome_drinks' && meal.items.length === 0) {
    return (
      <div>
        <p className="text-[15px] font-bold" style={{ color: '#0d9488' }}>{line}</p>
        {meal.notes.map((n) => <NoteLine key={n.id} note={n} />)}
      </div>
    )
  }

  return (
    <div>
      <p className="text-[15px] font-bold">{line}</p>
      {meal.items.length > 0 && (
        <div className="menu-dish-box text-[14px]">
          {meal.items.map((i) => i.text).join(', ')} ।
        </div>
      )}
      {meal.notes.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {meal.notes.map((n) => <NoteLine key={n.id} note={n} />)}
        </div>
      )}
    </div>
  )
}

function NoteLine({ note }: { note: MenuSpecialNoteRow }) {
  return (
    <p className="text-[13.5px] font-semibold" style={{ color: NOTE_COLORS[note.color] }}>
      {note.text}
    </p>
  )
}
