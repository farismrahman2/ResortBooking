'use client'

import { useState, useRef } from 'react'
import { ChevronLeft, ChevronRight, Check, CloudOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { normaliseMaterials } from '@/lib/field-visits/visit-ref'
import { TOTAL_STEPS, STEP_TITLES } from '@/lib/validators/field-visits'
import { putVisit, type QueuedVisit } from '@/lib/field-visits/offline-store'
import type { WizardDraft } from './FieldVisitWizard'
import type { CrmSector } from '@/lib/supabase/types-crm'
import type { SalesEmployee } from '@/lib/supabase/types'
import type { FieldVisitBand } from '@/lib/supabase/types-field-visits'
import { StepVisit }        from './steps/StepVisit'
import { StepOrganisation } from './steps/StepOrganisation'
import { StepContacts }     from './steps/StepContacts'
import { StepRequirements } from './steps/StepRequirements'
import { StepVenues }       from './steps/StepVenues'
import { StepOutcome }      from './steps/StepOutcome'
import { StepReview }       from './steps/StepReview'

function emptyDraft(): WizardDraft {
  return {
    visit_date: '', sales_executive_id: '', territory_zone: '', visit_type: '',
    organisation_name: '', office_address: '', sector_id: '', employee_band: '',
    decision_signoff: [], best_time_to_call: '', preferred_channel: [],
    event_types: [], events_per_year: '', typical_headcount: '',
    event_format: [], preferred_day: [], budget_per_head_band: '',
    rooms_needed: '', annual_event_spend: '', peak_months: [], transport: [],
    interest_level: '', materials_given: [], next_event_month: '',
    next_event_type: '', next_event_pax: '', next_step: [],
    due_by: '', follow_up_owner_id: '', account_id: null,
    contacts: [{ name: '', designation: '', department: '', mobile: '', email: '', is_decision_maker: false }],
    venues: [],
  }
}

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

/**
 * The offline twin of FieldVisitWizard. Same step components, but every write
 * goes to IndexedDB instead of a server action, and "Submit" means "queue for
 * upload" rather than "validate and commit".
 *
 * Validation is intentionally NOT enforced here — a rep in a dead zone must be
 * able to finish and queue whatever they got. The submit schema runs server-side
 * at sync time; anything incomplete lands as a draft rather than being rejected.
 */
export function OfflineWizard({
  visit, sectors, employees, employeeBands, budgetBands, onClose,
}: {
  visit:         QueuedVisit
  sectors:       CrmSector[]
  employees:     SalesEmployee[]
  employeeBands: FieldVisitBand[]
  budgetBands:   FieldVisitBand[]
  onClose:       () => void | Promise<void>
}) {
  const [draft, setDraft] = useState<WizardDraft>(() => {
    const p = visit.payload as Partial<WizardDraft>
    return { ...emptyDraft(), ...(p ?? {}) } as WizardDraft
  })
  const [step, setStep] = useState(1)
  const [dir, setDir]   = useState<'fwd' | 'back'>('fwd')
  const [saving, setSaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function persist(next: WizardDraft, status: QueuedVisit['status'] = 'draft', submitted = false) {
    return putVisit({ ...visit, payload: toPayload(next), status, submitted })
  }

  function update(patch: Partial<WizardDraft>) {
    setDraft((prev) => {
      const next = { ...prev, ...patch }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => { void persist(next) }, 600)
      return next
    })
  }

  function updateMaterials(next: string[], justToggled: string) {
    update({ materials_given: normaliseMaterials(next, justToggled) })
  }

  function goToStep(n: number) {
    if (n === step) return
    setDir(n > step ? 'fwd' : 'back')
    setStep(n)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(8) } catch { /* unsupported */ }
    }
    window.scrollTo({ top: 0 })
    if (timer.current) clearTimeout(timer.current)
    void persist(draft)
  }

  async function queueForUpload() {
    setSaving(true)
    // Best-effort location; never block queuing on it.
    let gps: { lat: number; lng: number } | null = null
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      gps = await new Promise((resolve) => {
        const done = setTimeout(() => resolve(null), 5000)
        navigator.geolocation.getCurrentPosition(
          (p) => { clearTimeout(done); resolve({ lat: p.coords.latitude, lng: p.coords.longitude }) },
          ()  => { clearTimeout(done); resolve(null) },
          { timeout: 5000 },
        )
      })
    }
    await putVisit({
      ...visit, payload: toPayload(draft), status: 'pending', submitted: true, gps,
    })
    setSaving(false)
    toast.success('Visit queued', {
      description: navigator.onLine
        ? 'Uploading now…'
        : 'It will upload automatically when you get signal.',
    })
    await onClose()
  }

  const isLast = step === TOTAL_STEPS
  const common = { draft, update }

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[640px] flex-col bg-white">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => (step > 1 ? goToStep(step - 1) : onClose())}
            aria-label="Back"
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-gray-600 active:bg-gray-100"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-gray-900">{STEP_TITLES[step]}</p>
            <p className="text-xs text-gray-500">Step {step} of {TOTAL_STEPS} · offline</p>
          </div>
          <span className="flex flex-shrink-0 items-center gap-1 text-[11px] font-medium text-amber-600">
            <CloudOff size={13} /> On device
          </span>
        </div>
        <div className="flex items-center gap-1 px-3 pb-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((n) => (
            <span key={n} className={cn(
              'h-1.5 flex-1 rounded-full transition-all duration-300 motion-reduce:transition-none',
              n === step ? 'bg-amber-500' : n < step ? 'bg-amber-400' : 'bg-gray-200',
            )} />
          ))}
        </div>
      </header>

      <main key={step} className="flex-1 space-y-5 px-4 py-5 pb-28">
        {step === 1 && <StepVisit {...common} employees={employees} />}
        {step === 2 && <StepOrganisation {...common} sectors={sectors} employeeBands={employeeBands} />}
        {/* Cards are captured after sync in v1 — offline photo queueing is the
            next slice, so the capture control is hidden here rather than
            silently failing. */}
        {step === 3 && <StepContacts {...common} visitId={visit.localId} cards={[]} />}
        {step === 4 && <StepRequirements {...common} budgetBands={budgetBands} />}
        {step === 5 && <StepVenues {...common} onSkip={() => goToStep(6)} />}
        {step === 6 && <StepOutcome {...common} employees={employees} onMaterials={updateMaterials} />}
        {step === 7 && (
          <StepReview
            draft={draft} visitRef="Not yet assigned"
            sectors={sectors} employees={employees}
            employeeBands={employeeBands} budgetBands={budgetBands}
            errorSteps={[]} submitError={null}
            attachGps={false} onToggleGps={() => {}}
            onEditStep={goToStep}
          />
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[640px] border-t border-gray-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex gap-3">
          {step > 1 && (
            <button
              type="button" onClick={() => goToStep(step - 1)}
              className="min-h-[48px] flex-1 rounded-xl border border-gray-300 px-4 text-base font-medium text-gray-700"
            >
              Back
            </button>
          )}
          {isLast ? (
            <button
              type="button" onClick={queueForUpload} disabled={saving}
              className="flex min-h-[48px] flex-[2] items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 text-base font-semibold text-white disabled:opacity-60"
            >
              <Check size={17} /> {saving ? 'Queuing…' : 'Queue for upload'}
            </button>
          ) : (
            <button
              type="button" onClick={() => goToStep(step + 1)}
              className="flex min-h-[48px] flex-[2] items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 text-base font-semibold text-white active:scale-[0.98]"
            >
              {step === TOTAL_STEPS - 1 ? 'Review' : 'Next'} <ChevronRight size={18} />
            </button>
          )}
        </div>
      </footer>
    </div>
  )
}
