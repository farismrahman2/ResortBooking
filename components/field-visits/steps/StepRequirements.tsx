'use client'

import { TextField, SelectField, StepSection, FieldLabel, ChipGroup } from '../wizard-ui'
import {
  EVENT_TYPE_OPTIONS, EVENT_FORMAT_OPTIONS, PREFERRED_DAY_OPTIONS,
  MONTH_OPTIONS, TRANSPORT_OPTIONS,
} from '@/lib/supabase/types-field-visits'
import type { WizardDraft } from '../FieldVisitWizard'
import type { FieldVisitBand } from '@/lib/supabase/types-field-visits'

export function StepRequirements({
  draft, update, budgetBands,
}: {
  draft: WizardDraft
  update: (p: Partial<WizardDraft>) => void
  budgetBands: FieldVisitBand[]
}) {
  return (
    <StepSection>
      <div>
        <FieldLabel>Event types they run</FieldLabel>
        <ChipGroup
          options={EVENT_TYPE_OPTIONS}
          value={draft.event_types}
          onChange={(next) => update({ event_types: next })}
        />
      </div>

      <TextField
        label="Events per year"
        value={draft.events_per_year}
        onChange={(v) => update({ events_per_year: v })}
        placeholder="e.g. 3–4"
      />
      <TextField
        label="Typical headcount"
        value={draft.typical_headcount}
        onChange={(v) => update({ typical_headcount: v })}
        placeholder="e.g. 80–120"
      />

      <div>
        <FieldLabel>Event format</FieldLabel>
        <ChipGroup
          options={EVENT_FORMAT_OPTIONS}
          value={draft.event_format}
          onChange={(next) => update({ event_format: next })}
        />
      </div>

      <div>
        <FieldLabel>Preferred day</FieldLabel>
        <ChipGroup
          options={PREFERRED_DAY_OPTIONS}
          value={draft.preferred_day}
          onChange={(next) => update({ preferred_day: next })}
        />
      </div>

      <SelectField
        label="Budget per head (BDT)"
        value={draft.budget_per_head_band}
        onChange={(v) => update({ budget_per_head_band: v })}
        options={budgetBands.map((b) => ({ value: b.code, label: b.label }))}
      />

      <TextField
        label="Rooms needed"
        type="text" inputMode="numeric"
        value={draft.rooms_needed}
        onChange={(v) => update({ rooms_needed: v.replace(/[^0-9]/g, '') })}
        placeholder="0"
      />
      <TextField
        label="Annual event spend (BDT)"
        type="text" inputMode="numeric"
        value={draft.annual_event_spend}
        onChange={(v) => update({ annual_event_spend: v.replace(/[^0-9]/g, '') })}
        placeholder="e.g. 500000"
      />

      <div>
        <FieldLabel>Peak months</FieldLabel>
        <ChipGroup
          options={MONTH_OPTIONS}
          value={draft.peak_months}
          onChange={(next) => update({ peak_months: next })}
        />
      </div>

      <div>
        <FieldLabel>Transport</FieldLabel>
        <ChipGroup
          options={TRANSPORT_OPTIONS}
          value={draft.transport}
          onChange={(next) => update({ transport: next })}
        />
      </div>
    </StepSection>
  )
}
