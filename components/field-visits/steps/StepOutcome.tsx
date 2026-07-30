'use client'

import { TextField, SelectField, StepSection, FieldLabel, ChipGroup, RadioRows } from '../wizard-ui'
import {
  INTEREST_OPTIONS, MATERIALS_OPTIONS, NEXT_STEP_OPTIONS, MONTH_OPTIONS,
  type InterestLevel,
} from '@/lib/supabase/types-field-visits'
import type { WizardDraft } from '../FieldVisitWizard'
import type { SalesEmployee } from '@/lib/supabase/types'

export function StepOutcome({
  draft, update, employees, onMaterials,
}: {
  draft: WizardDraft
  update: (p: Partial<WizardDraft>) => void
  employees: SalesEmployee[]
  /** OUT.02 exclusivity is applied by the wizard's shared helper. */
  onMaterials: (next: string[], justToggled: string) => void
}) {
  return (
    <StepSection>
      <div>
        <FieldLabel required>Interest level</FieldLabel>
        <RadioRows<InterestLevel>
          options={INTEREST_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={draft.interest_level as InterestLevel}
          onChange={(v) => update({ interest_level: v })}
          columns={2}
        />
      </div>

      <div>
        <FieldLabel>Materials given</FieldLabel>
        <ChipGroup
          options={MATERIALS_OPTIONS}
          value={draft.materials_given}
          onChange={onMaterials}
        />
        <p className="mt-1 text-xs text-gray-500">&ldquo;Nothing&rdquo; clears the other options.</p>
      </div>

      <SelectField
        label="Next event month"
        value={draft.next_event_month}
        onChange={(v) => update({ next_event_month: v })}
        options={MONTH_OPTIONS.map((m) => ({ value: m, label: m }))}
      />
      <TextField
        label="Next event type"
        value={draft.next_event_type}
        onChange={(v) => update({ next_event_type: v })}
        placeholder="e.g. Annual picnic"
      />
      <TextField
        label="Next event pax"
        type="text" inputMode="numeric"
        value={draft.next_event_pax}
        onChange={(v) => update({ next_event_pax: v.replace(/[^0-9]/g, '') })}
      />

      <div>
        <FieldLabel required>Next step</FieldLabel>
        <ChipGroup
          options={NEXT_STEP_OPTIONS}
          value={draft.next_step}
          onChange={(next) => update({ next_step: next })}
          columns={1}
        />
      </div>

      <TextField
        label="Due by" type="date"
        value={draft.due_by}
        onChange={(v) => update({ due_by: v })}
      />
      <SelectField
        label="Follow-up owner"
        value={draft.follow_up_owner_id}
        onChange={(v) => update({ follow_up_owner_id: v })}
        options={employees.map((e) => ({ value: e.id, label: e.full_name }))}
      />
    </StepSection>
  )
}
