'use client'

import { Pencil, AlertTriangle, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StepSection } from '../wizard-ui'
import type { WizardDraft } from '../FieldVisitWizard'
import type { FieldVisitBand } from '@/lib/supabase/types-field-visits'
import type { CrmSector } from '@/lib/supabase/types-crm'
import type { SalesEmployee } from '@/lib/supabase/types'

export function StepReview({
  draft, visitRef, sectors, employees, employeeBands, budgetBands,
  errorSteps, submitError, attachGps, onToggleGps, onEditStep, mode = 'submit',
}: {
  draft: WizardDraft
  visitRef: string
  sectors: CrmSector[]
  employees: SalesEmployee[]
  employeeBands: FieldVisitBand[]
  budgetBands: FieldVisitBand[]
  errorSteps: number[]
  submitError: string | null
  attachGps: boolean
  onToggleGps: (v: boolean) => void
  onEditStep: (n: number) => void
  /** 'amend' when correcting an already-submitted visit. */
  mode?: 'submit' | 'amend'
}) {
  const sectorName = sectors.find((s) => s.id === draft.sector_id)?.display_name
  const execName   = employees.find((e) => e.id === draft.sales_executive_id)?.full_name
  const ownerName  = employees.find((e) => e.id === draft.follow_up_owner_id)?.full_name
  const empBand    = employeeBands.find((b) => b.code === draft.employee_band)?.label
  const budBand    = budgetBands.find((b) => b.code === draft.budget_per_head_band)?.label
  const namedContacts = draft.contacts.filter((c) => c.name.trim())

  const L = (v: string | undefined | null) => (v && v.trim() ? v : '—')
  const A = (v: string[]) => (v.length ? v.join(', ') : '—')

  return (
    <StepSection>
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
        <p className="text-xs text-gray-500">Visit reference</p>
        <p className="font-mono text-base font-semibold text-gray-900">{visitRef}</p>
      </div>

      {submitError && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-3">
          <p className="flex items-start gap-2 text-sm font-semibold text-red-900">
            <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
            {submitError}
          </p>
          <p className="mt-1 text-xs text-red-700">Fix the sections marked below, then submit again.</p>
        </div>
      )}

      <Group title="A · Visit" step={1} errorSteps={errorSteps} onEdit={onEditStep}>
        <Row k="Date"      v={L(draft.visit_date)} />
        <Row k="Executive" v={L(execName)} />
        <Row k="Territory" v={L(draft.territory_zone)} />
        <Row k="Type"      v={L(draft.visit_type.replace(/_/g, ' '))} />
      </Group>

      <Group title="B · Organisation" step={2} errorSteps={errorSteps} onEdit={onEditStep}>
        <Row k="Name"      v={L(draft.organisation_name)} />
        <Row k="Address"   v={L(draft.office_address)} />
        <Row k="Sector"    v={L(sectorName)} />
        <Row k="Employees" v={L(empBand)} />
        {draft.account_id && <Row k="CRM" v="Linked to existing account" />}
      </Group>

      <Group title="C · Contacts" step={3} errorSteps={errorSteps} onEdit={onEditStep}>
        {namedContacts.length === 0
          ? <p className="text-sm text-gray-400">No contacts added</p>
          : namedContacts.map((c, i) => (
              <Row key={i} k={c.name} v={[c.designation, c.mobile].filter(Boolean).join(' · ') || '—'} />
            ))}
        <Row k="Sign-off"  v={A(draft.decision_signoff)} />
        <Row k="Best time" v={L(draft.best_time_to_call)} />
        <Row k="Channel"   v={A(draft.preferred_channel)} />
      </Group>

      <Group title="D · Requirements" step={4} errorSteps={errorSteps} onEdit={onEditStep}>
        <Row k="Event types" v={A(draft.event_types)} />
        <Row k="Per year"    v={L(draft.events_per_year)} />
        <Row k="Headcount"   v={L(draft.typical_headcount)} />
        <Row k="Format"      v={A(draft.event_format)} />
        <Row k="Day"         v={A(draft.preferred_day)} />
        <Row k="Budget/head" v={L(budBand)} />
        <Row k="Rooms"       v={L(draft.rooms_needed)} />
        <Row k="Annual spend" v={L(draft.annual_event_spend)} />
        <Row k="Peak months" v={A(draft.peak_months)} />
        <Row k="Transport"   v={A(draft.transport)} />
      </Group>

      <Group title="E · Current venues" step={5} errorSteps={errorSteps} onEdit={onEditStep}>
        {draft.venues.length === 0
          ? <p className="text-sm text-gray-400">None recorded</p>
          : draft.venues.map((v, i) => (
              <Row key={i} k={L(v.venue_name)} v={[v.event_month_year, v.pax && `${v.pax} pax`].filter(Boolean).join(' · ') || '—'} />
            ))}
      </Group>

      <Group title="F · Outcome" step={6} errorSteps={errorSteps} onEdit={onEditStep}>
        <Row k="Interest"   v={L(draft.interest_level)} />
        <Row k="Materials"  v={A(draft.materials_given)} />
        <Row k="Next event" v={[draft.next_event_month, draft.next_event_type, draft.next_event_pax && `${draft.next_event_pax} pax`].filter(Boolean).join(' · ') || '—'} />
        <Row k="Next step"  v={A(draft.next_step)} />
        <Row k="Due by"     v={L(draft.due_by)} />
        <Row k="Owner"      v={L(ownerName)} />
      </Group>

      {mode === 'amend' && (
        <div className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
          You&apos;re correcting an already-submitted visit. Changes save as you go —
          the original submission time and reference are kept.
        </div>
      )}

      {/* Location is always captured on submit — it's the proof the rep was on
          site. Not a toggle. Skipped when amending so the original capture
          isn't overwritten. */}
      {mode === 'submit' && (
        <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <MapPin size={15} className="mt-0.5 flex-shrink-0 text-amber-600" />
          <p className="text-xs text-gray-600">
            Your location is attached automatically when you submit.
            If location is off or denied, the visit still submits without it.
          </p>
        </div>
      )}
    </StepSection>
  )
}

function Group({
  title, step, errorSteps, onEdit, children,
}: {
  title: string; step: number; errorSteps: number[]
  onEdit: (n: number) => void; children: React.ReactNode
}) {
  const hasError = errorSteps.includes(step)
  return (
    <div className={cn(
      'rounded-xl border bg-white',
      hasError ? 'border-red-400 ring-1 ring-red-200' : 'border-gray-200',
    )}>
      <div className={cn(
        'flex items-center justify-between border-b px-3 py-2',
        hasError ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50',
      )}>
        <p className={cn('text-xs font-semibold uppercase tracking-wide', hasError ? 'text-red-800' : 'text-gray-600')}>
          {title}
        </p>
        <button
          type="button"
          onClick={() => onEdit(step)}
          className={cn(
            'inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold',
            hasError ? 'bg-red-600 text-white' : 'text-amber-700',
          )}
        >
          <Pencil size={12} /> {hasError ? 'Fix' : 'Edit'}
        </button>
      </div>
      <div className="space-y-1 px-3 py-2.5">{children}</div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-gray-50 py-1 last:border-0">
      <span className="flex-shrink-0 text-xs text-gray-500">{k}</span>
      <span className="text-right text-sm text-gray-900">{v}</span>
    </div>
  )
}
