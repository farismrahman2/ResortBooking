# Making the PMS livelier, more rewarding, and more fun to use

A survey of the whole app turned up one dominant finding and several smaller
ones. This plan is ordered by **impact per unit of risk**, not by how exciting
each item sounds.

---

## The headline finding

**69 files render an HTML `<table>`. Exactly 2 have a mobile card fallback.**

The other 67 rely on `overflow-x-auto`. On the 375px Android screens most of
your staff actually use, every list in the product — bookings, quotes,
expenses, payroll, inventory, CRM, users, and ~20 report pages — is a
horizontal-scroll pan where the guest name scrolls out of view before the
amount scrolls in.

No amount of animation polish matters next to this. It is the single biggest
"this feels unpleasant to use" factor in the app, and it affects the people who
use it most (front desk, reservations) on the device they use most.

---

## Phase 1 — Foundations (highest impact)

### 1.1 A `DataTable` primitive with automatic mobile cards
One component that renders a real table ≥640px and a stack of tappable cards
below it. Each column declares whether it's the card's title, subtitle, badge,
or metadata.

Migrate the ~12 highest-traffic lists first: bookings, quotes, checkout,
expenses, CRM accounts, CRM opportunities, inventory items, HR employees,
attendance, payroll, field visits (done), enquiries.

*Why first:* fixes the worst problem, and every later visual improvement lands
on a consistent surface instead of 69 hand-rolled copies.

### 1.2 A toast system
There is **no toast anywhere in the app**. Today, 69 files mutate data and just
call `router.refresh()` — the row silently changes and nothing confirms the
save. Elsewhere, feedback is ad-hoc inline text; errors are 89 hand-rolled red
`<p>` tags.

Add one `<Toaster>` in the agent layout plus a `toast.success/error/undo()`
helper. Wire it into every server action call site.

*Reward mechanic:* success toasts are where "that worked" satisfaction lives.
Cheap to add, felt constantly.

### 1.3 Replace 24+ `window.confirm` / `alert` calls
Destructive actions currently use raw browser dialogs — they look like a 2003
webpage and can't be styled or branded. You already have a good `Modal` that
bottom-sheets on mobile.

Worst offender to fix first (`components/menus/MealBlock.tsx:121`) overloads a
confirm box as a three-way choice:
`'Replace the current dishes with the template?\nOK = replace · Cancel = append after them'`

Add a `<ConfirmDialog>` built on the existing Modal, with a `danger` variant.

### 1.4 An `EmptyState` component
~40 empty states exist; only 2 have any visual, and most are dead ends with no
way forward — e.g. `components/inventory/CountsTable.tsx:14` is just
"No counts yet." in a big empty box.

One component: icon, headline, one-line explanation, primary CTA. Distinguish
*"nothing here yet"* (invite to create) from *"nothing matches"* (offer to
clear filters) — the field-visits list now does this and can be the template.

---

## Phase 2 — The dashboard should feel like arriving at work

Currently `app/(agent)/page.tsx` is a wall of numbers, and lines 24-44 redirect
front desk, reservations, corporate sales, and review collectors away entirely
— so it's a management-only page that only management ever sees.

- **Greeting + today's framing.** "Good morning, Shible — 6 arrivals, 4
  departures, 12 of 16 rooms occupied." Replaces the anonymous stat grid as the
  first thing you read.
- **Sparklines on the stat cards.** `recharts` is already a dependency and
  already used in analytics — it has simply never been put on the dashboard. A
  7-day trend line under each number costs nothing new.
- **Occupancy as a visual**, not a percentage — a 16-room strip that fills.
- **Arrivals / departures today**, actionable rows straight into checkout.
- **Role-aware landing pages.** Rather than redirecting front desk *away*, give
  them their own useful home: today's arrivals, pending checkouts, shift
  takings.

---

## Phase 3 — Personality

Your `tailwind.config.ts` defines a genuinely nice palette — `forest` 50-950,
`amber` accents, per-status colours — and the app then renders as gray-50 and
white almost everywhere. Forest appears only on primary buttons and links.

- **Use the status colours that already exist.** `Badge.tsx:10-15` hardcodes
  `bg-blue-50 text-blue-700` and ignores the `status` map defined in the config.
- **Warm the neutral surfaces.** A faint forest tint on page backgrounds instead
  of pure gray; forest-tinted table hovers.
- **Brand the empty states** with a leaf motif — `public/` currently has no
  imagery at all beyond the logo.
- **Richer skeletons.** `RouteSkeleton.tsx` is already centralised and correct
  (82 routes use it, and it keeps the real page title during navigation) — it
  just needs content-shaped rows rather than plain gray boxes.
- **`error.tsx` / `not-found.tsx`** — neither exists anywhere in `app/`. Today a
  runtime error shows the raw Next.js overlay.

---

## Phase 4 — Reward and momentum

These are the "fun" items. They only work once Phases 1-2 make the app pleasant;
delight layered on friction reads as noise.

- **Micro-interactions.** `QuickActions.tsx:17-19` (icon scales, forest tint on
  hover) is currently the *only* real micro-interaction in the app and it's
  lovely. Extend that vocabulary: button press-scale, checkmark morph on
  success, count-up on stat numbers.
- **Streaks and progress for repeat work.** Attendance marked 5 days running;
  "12 of 16 rooms checked out today" with a filling bar. The KPI tracker
  (`KpiTrackerGrid.tsx:11`) already has a ✓/⚠/✗ vocabulary — an existing scoring
  model to lean into.
- **Celebrate genuinely meaningful events**, sparingly: booking confirmed,
  payroll finalised, monthly target hit. The field-visit submit screen is the
  template. Never celebrate routine saves — that's how delight becomes noise.
- **Undo instead of confirm** for reversible actions. Faster *and* safer than a
  dialog, and it removes a tap from common paths.

---

## Explicitly not recommended

- **Dark mode** — high effort across 139 pages, low demand for a daytime
  business tool.
- **A component library swap** (shadcn etc.) — your primitives are decent; the
  gap is coverage, not quality. A migration would stall feature work for weeks.
- **Gamification with points/badges for staff** — in a workplace tool tied to
  payroll and performance, this reads as surveillance rather than fun.
- **Heavy animation.** Everything should stay ≤200ms and honour
  `prefers-reduced-motion`. Staff use this 50× a day; animation that charms once
  irritates the fiftieth time.

---

## Suggested sequencing

| Phase | Roughly | Risk | User-visible payoff |
|---|---|---|---|
| 1.2 Toasts | half a day | very low | immediate, everywhere |
| 1.4 EmptyState | half a day | very low | high |
| 1.3 ConfirmDialog | ~1 day | low | removes the cheapest-feeling UI |
| 1.1 DataTable + 12 migrations | 3-4 days | medium | **transformative on mobile** |
| 2 Dashboard | 2 days | low | high for managers |
| 3 Personality | 2 days | low | ambient |
| 4 Reward | 2 days | low | the "fun" layer |

**If you only do one thing: 1.1.** It fixes the actual daily pain. **If you only
have an afternoon: 1.2 + 1.4** — cheapest ratio of felt improvement to effort.
