'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Check, CloudOff, Loader2, AlertTriangle, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { saveDraftVisit, submitFieldVisit } from '@/lib/actions/field-visits'
import { normaliseMaterials } from '@/lib/field-visits/visit-ref'
import { TOTAL_STEPS, STEP_TITLES, FIELD_TO_STEP } from '@/lib/validators/field-visits'
import type { FieldVisitWithChildren, FieldVisitBand } from '@/lib/supabase/types-field-visits'
import type { CrmSector } from '@/lib/supabase/types-crm'
import type { SalesEmployee } from '@/lib/supabase/types'
import { StepVisit }        from './steps/StepVisit'
import { StepOrganisation } from './steps/StepOrganisation'
import { StepContacts }     from './steps/StepContacts'
import { StepRequirements } from './steps/StepRequirements'
import { StepVenues }       from './steps/StepVenues'
import { StepOutcome }      from './steps/StepOutcome'
import { StepReview }       from './steps/StepReview'

export interface WizardDraft {
  visit_date: string; sales_executive_id: string; territory_zone: string; visit_type: string
  organisation_name: string; office_address: string; sector_id: string; employee_band: string
  decision_signoff: string[]; best_time_to_call: string; preferred_channel: string[]
  event_types: string[]; events_per_year: string; typical_headcount: string
  event_format: string[]; preferred_day: string[]; budget_per_head_band: string
  rooms_needed: string; annual_event_spend: string; peak_months: string[]; transport: string[]
  interest_level: string; materials_given: string[]; next_event_month: string
  next_event_type: string; next_event_pax: string; next_step: string[]
  due_by: string; follow_up_owner_id: string
  account_id: string | null
  contacts: { name: string; designation: string; department: string; mobile: string; email: string; is_decision_maker: boolean }[]
  venues:   { venue_name: string; event_month_year: string; pax: string; rate_per_head: string; feedback: string }[]
}

function emptyContact() {
  return { name: '', designation: '', department: '', mobile: '', email: '', is_decision_maker: false }
}

function fromServer(v: FieldVisitWithChildren): WizardDraft {
  return {
    visit_date: v.visit_date ?? '', sales_executive_id: v.sales_executive_id ?? '',
    territory_zone: v.territory_zone ?? '', visit_type: v.visit_type ?? '',
    organisation_name: v.organisation_name ?? '', office_address: v.office_address ?? '',
    sector_id: v.sector_id ?? '', employee_band: v.employee_band ?? '',
    decision_signoff: v.decision_signoff ?? [], best_time_to_call: v.best_time_to_call ?? '',
    preferred_channel: v.preferred_channel ?? [],
    event_types: v.event_types ?? [], events_per_year: v.events_per_year ?? '',
    typical_headcount: v.typical_headcount ?? '', event_format: v.event_format ?? [],
    preferred_day: v.preferred_day ?? [], budget_per_head_band: v.budget_per_head_band ?? '',
    rooms_needed: v.rooms_needed?.toString() ?? '', annual_event_spend: v.annual_event_spend?.toString() ?? '',
    peak_months: v.peak_months ?? [], transport: v.transport ?? [],
    interest_level: v.interest_level ?? '', materials_given: v.materials_given ?? [],
    next_event_month: v.next_event_month ?? '', next_event_type: v.next_event_type ?? '',
    next_event_pax: v.next_event_pax?.toString() ?? '', next_step: v.next_step ?? [],
    due_by: v.due_by ?? '', follow_up_owner_id: v.follow_up_owner_id ?? '',
    account_id: v.account_id ?? null,
    contacts: v.contacts.length
      ? v.contacts.map((c) => ({
          name: c.name ?? '', designation: c.designation ?? '', department: c.department ?? '',
          mobile: c.mobile ?? '', email: c.email ?? '', is_decision_maker: c.is_decision_maker,
        }))
      : [emptyContact()],
    venues: v.venues.map((x) => ({
      venue_name: x.venue_name ?? '', event_month_year: x.event_month_year ?? '',
      pax: x.pax?.toString() ?? '', rate_per_head: x.rate_per_head?.toString() ?? '',
      feedback: x.feedback ?? '',
    })),
  }
}

/** Shape sent to the server — strings coerced, empties nulled. */
function toPayload(d: WizardDraft) {
  const s = (v: string) => (v.trim() ? v.trim() : null)
  return {
    ...d,
    visit_date: s(d.visit_date), sales_executive_id: s(d.sales_executive_id),
    territory_zone: s(d.territory_zone), visit_type: s(d.visit_type),
    organisation_name: s(d.organisation_name), office_address: s(d.office_address),
    sector_id: s(d.sector_id), employee_band: s(d.employee_band),
    best_time_to_call: s(d.best_time_to_call),
    events_per_year: s(d.events_per_year), typical_headcount: s(d.typical_headcount),
    budget_per_head_band: s(d.budget_per_head_band),
    rooms_needed: d.rooms_needed ? Number(d.rooms_needed) : null,
    annual_event_spend: d.annual_event_spend ? Number(d.annual_event_spend) : null,
    interest_level: s(d.interest_level), next_event_month: s(d.next_event_month),
    next_event_type: s(d.next_event_type),
    next_event_pax: d.next_event_pax ? Number(d.next_event_pax) : null,
    due_by: s(d.due_by), follow_up_owner_id: s(d.follow_up_owner_id),
    contacts: d.contacts.map((c, i) => ({
      sort_order: i, name: s(c.name), designation: s(c.designation),
      department: s(c.department), mobile: s(c.mobile), email: s(c.email),
      is_decision_maker: c.is_decision_maker,
    })),
    venues: d.venues.map((v, i) => ({
      sort_order: i, venue_name: s(v.venue_name), event_month_year: s(v.event_month_year),
      pax: v.pax ? Number(v.pax) : null,
      rate_per_head: v.rate_per_head ? Number(v.rate_per_head) : null,
      feedback: s(v.feedback),
    })),
  }
}

type SaveState = 'idle' | 'saving' | 'saved' | 'local'

interface Props {
  visit:         FieldVisitWithChildren
  /** Starting step — from the URL. Stepping after mount is client-side only. */
  initialStep:   number
  sectors:       CrmSector[]
  employees:     SalesEmployee[]
  employeeBands: FieldVisitBand[]
  budgetBands:   FieldVisitBand[]
}

export function FieldVisitWizard({ visit, initialStep, sectors, employees, employeeBands, budgetBands }: Props) {
  const router  = useRouter()
  const lsKey   = `fv:draft:${visit.id}`
  const [draft, setDraft]         = useState<WizardDraft>(() => fromServer(visit))
  // Step lives in CLIENT state. Routing between steps used to be a full server
  // navigation (re-running the page's 4 queries + rehydrating) which made
  // "Next" take seconds on mobile data. The URL is kept in sync via
  // history.replaceState purely so refresh/deep-link/back still work.
  const [step, setStep]           = useState(initialStep)
  const [dir, setDir]             = useState<'fwd' | 'back'>('fwd')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [restorable, setRestorable] = useState<WizardDraft | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [errorSteps, setErrorSteps]   = useState<number[]>([])
  const [attachGps, setAttachGps]     = useState(false)
  const [furthest, setFurthest]       = useState(initialStep)
  const dirtyRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // On mount, offer to restore a newer local draft (network died mid-form).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { savedAt: number; data: WizardDraft }
      const serverAt = new Date(visit.updated_at).getTime()
      if (parsed.savedAt > serverAt + 1000) setRestorable(parsed.data)
    } catch { /* corrupt local draft — ignore */ }
  }, [lsKey, visit.updated_at])

  // Warn before leaving with unsynced changes.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // Browser/Android back button — we own the URL now, so read the step back out.
  useEffect(() => {
    function onPop() {
      const m = window.location.pathname.match(/\/edit\/(\d+)$/)
      const n = m ? Number(m[1]) : 1
      if (n >= 1 && n <= TOTAL_STEPS) { setDir('back'); setStep(n) }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const persistLocal = useCallback((d: WizardDraft) => {
    try { localStorage.setItem(lsKey, JSON.stringify({ savedAt: Date.now(), data: d })) } catch { /* quota */ }
  }, [lsKey])

  const pushToServer = useCallback(async (d: WizardDraft) => {
    setSaveState('saving')
    try {
      const r = await saveDraftVisit(visit.id, toPayload(d))
      if (r.success) { dirtyRef.current = false; setSaveState('saved'); try { localStorage.removeItem(lsKey) } catch {} }
      else setSaveState('local')
    } catch { setSaveState('local') }   // offline — local copy is the safety net
  }, [visit.id, lsKey])

  /** Every change: persist locally immediately, debounce the server push. */
  function update(patch: Partial<WizardDraft>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch }
      dirtyRef.current = true
      persistLocal(next)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => { void pushToServer(next) }, 1500)
      return next
    })
  }

  /** OUT.02 exclusivity lives in one shared helper so UI and server agree. */
  function updateMaterials(next: string[], justToggled: string) {
    update({ materials_given: normaliseMaterials(next, justToggled) })
  }

  /**
   * Instant step change. The save is fire-and-forget — we already persisted to
   * localStorage on every keystroke, so nothing is at risk if this is still in
   * flight. Blocking the UI on a Supabase round-trip here was the whole reason
   * "Next" felt slow.
   */
  function goToStep(n: number) {
    if (n === step) return
    setDir(n > step ? 'fwd' : 'back')
    setStep(n)
    setFurthest((f) => Math.max(f, n))
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(8) } catch { /* unsupported */ }
    }
    window.scrollTo({ top: 0, behavior: 'auto' })
    try {
      window.history.replaceState(null, '', `/crm/field-visits/${visit.id}/edit/${n}`)
    } catch { /* older browsers */ }
    if (timerRef.current) clearTimeout(timerRef.current)
    void pushToServer(draft)          // background — never blocks the transition
  }

  async function handleSubmit() {
    setSubmitting(true); setSubmitError(null); setErrorSteps([])
    try {
      if (timerRef.current) clearTimeout(timerRef.current)
      const saved = await saveDraftVisit(visit.id, toPayload(draft))
      if (!saved.success) { setSubmitError(saved.error); setSubmitting(false); return }

      // Geolocation must NEVER block submit — 5s cap, then proceed without it.
      let gps: { lat: number; lng: number } | null = null
      if (attachGps && typeof navigator !== 'undefined' && navigator.geolocation) {
        gps = await new Promise((resolve) => {
          const done = setTimeout(() => resolve(null), 5000)
          navigator.geolocation.getCurrentPosition(
            (p) => { clearTimeout(done); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }) },
            ()  => { clearTimeout(done); resolve(null) },
            { timeout: 5000 },
          )
        })
      }

      const r = await submitFieldVisit(visit.id, gps)
      if (!r.success) {
        setSubmitError(r.error)
        // Map the failing field back to the step that owns it.
        const steps = new Set<number>()
        for (const [field, st] of Object.entries(FIELD_TO_STEP)) {
          if (r.error.toLowerCase().includes(field.replace(/_/g, ' '))) steps.add(st)
        }
        if (/contact/i.test(r.error))      steps.add(3)
        if (/interest/i.test(r.error))     steps.add(6)
        if (/next step/i.test(r.error))    steps.add(6)
        if (/organisation/i.test(r.error)) steps.add(2)
        if (/visit date|executive/i.test(r.error)) steps.add(1)
        setErrorSteps([...steps])
        setSubmitting(false)
        return
      }
      try { localStorage.removeItem(lsKey) } catch {}
      dirtyRef.current = false
      router.push(`/crm/field-visits/${visit.id}?submitted=1`)
    } catch (err) {
      // Network died on submit — keep the payload, offer retry. Never drop it.
      persistLocal(draft)
      setSubmitError(err instanceof Error ? err.message : 'Network error — your answers are saved on this device.')
      setSubmitting(false)
    }
  }

  const isLast = step === TOTAL_STEPS
  const common = { draft, update }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[640px] flex-col bg-white">
      {/* Sticky header — back, title, progress */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => (step > 1 ? goToStep(step - 1) : router.push('/crm/field-visits'))}
            aria-label="Back"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-gray-600 active:bg-gray-100"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-gray-900">{STEP_TITLES[step]}</p>
            <p className="text-xs text-gray-500">
              Step {step} of {TOTAL_STEPS}
              {step > 1 && <span className="text-amber-600"> · {Math.round(((step - 1) / TOTAL_STEPS) * 100)}% done</span>}
            </p>
          </div>
          <SaveIndicator state={saveState} />
        </div>

        {/* Step rail — tap any visited step to jump straight back to it. */}
        <div className="flex items-center gap-1 px-3 pb-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => {
            const done    = n < step
            const current = n === step
            const visited = n <= furthest
            return (
              <button
                key={n}
                type="button"
                disabled={!visited}
                onClick={() => visited && goToStep(n)}
                aria-label={`Step ${n}: ${STEP_TITLES[n]}`}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'group relative h-1.5 flex-1 rounded-full transition-all duration-300 motion-reduce:transition-none',
                  current ? 'bg-amber-500' : done ? 'bg-amber-400' : visited ? 'bg-amber-200' : 'bg-gray-200',
                  visited && !current && 'active:scale-y-150',
                )}
              />
            )
          })}
        </div>
      </header>

      {/* Restore banner */}
      {restorable && (
        <div className="m-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="flex items-start gap-2 text-sm text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            Unsaved changes from this device are newer than the saved copy.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => { setDraft(restorable); setRestorable(null); dirtyRef.current = true }}
              className="min-h-[40px] flex-1 rounded-lg bg-amber-600 px-3 text-sm font-semibold text-white"
            >
              Restore unsaved changes
            </button>
            <button
              type="button"
              onClick={() => { setRestorable(null); try { localStorage.removeItem(lsKey) } catch {} }}
              className="min-h-[40px] rounded-lg border border-amber-300 px-3 text-sm font-medium text-amber-800"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Step body — keyed so each step animates in; ≤200ms, honours reduced motion */}
      <main
        key={step}
        className={cn(
          'flex-1 space-y-5 px-4 py-5 pb-28',
          dir === 'fwd' ? 'fv-slide-in-right' : 'fv-slide-in-left',
        )}
      >
        <style>{`
          @keyframes fvInRight { from { opacity: 0; transform: translateX(14px) } to { opacity: 1; transform: none } }
          @keyframes fvInLeft  { from { opacity: 0; transform: translateX(-14px) } to { opacity: 1; transform: none } }
          .fv-slide-in-right { animation: fvInRight 180ms ease-out }
          .fv-slide-in-left  { animation: fvInLeft  180ms ease-out }
          @media (prefers-reduced-motion: reduce) {
            .fv-slide-in-right, .fv-slide-in-left { animation: none }
          }
        `}</style>
        {step === 1 && <StepVisit {...common} employees={employees} />}
        {step === 2 && <StepOrganisation {...common} sectors={sectors} employeeBands={employeeBands} />}
        {step === 3 && <StepContacts {...common} />}
        {step === 4 && <StepRequirements {...common} budgetBands={budgetBands} />}
        {step === 5 && <StepVenues {...common} onSkip={() => goToStep(6)} />}
        {step === 6 && <StepOutcome {...common} employees={employees} onMaterials={updateMaterials} />}
        {step === 7 && (
          <StepReview
            draft={draft} visitRef={visit.visit_ref}
            sectors={sectors} employees={employees}
            employeeBands={employeeBands} budgetBands={budgetBands}
            errorSteps={errorSteps} submitError={submitError}
            attachGps={attachGps} onToggleGps={setAttachGps}
            onEditStep={goToStep}
          />
        )}
      </main>

      {/* Sticky thumb-zone actions */}
      <footer className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[640px] border-t border-gray-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={() => goToStep(step - 1)}
              className="min-h-[48px] flex-1 rounded-xl border border-gray-300 px-4 text-base font-medium text-gray-700 active:bg-gray-50"
            >
              Back
            </button>
          )}
          {isLast ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="min-h-[48px] flex-[2] rounded-xl bg-amber-600 px-4 text-base font-semibold text-white active:bg-amber-700 disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : submitError ? 'Retry submit' : 'Submit visit'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToStep(step + 1)}
              className="flex min-h-[48px] flex-[2] items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 text-base font-semibold text-white transition-transform active:scale-[0.98] active:bg-amber-700 motion-reduce:transition-none"
            >
              {step === TOTAL_STEPS - 1 ? 'Review' : 'Next'}
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return <span className="w-16" />
  const map = {
    saving: { icon: <Loader2 size={13} className="animate-spin" />, text: 'Saving…', tone: 'text-gray-500' },
    saved:  { icon: <Check size={13} />,    text: 'Saved',            tone: 'text-green-600' },
    local:  { icon: <CloudOff size={13} />, text: 'Saved locally',    tone: 'text-amber-600' },
  }[state]
  return (
    <span className={cn('flex flex-shrink-0 items-center gap-1 text-[11px] font-medium', map.tone)}>
      {map.icon}{map.text}
    </span>
  )
}

export { MapPin }
