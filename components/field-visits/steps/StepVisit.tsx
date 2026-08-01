'use client'

import { TextField, SelectField, StepSection, FieldLabel, RadioRows } from '../wizard-ui'
import { VISIT_TYPE_OPTIONS, type VisitType } from '@/lib/supabase/types-field-visits'
import type { WizardDraft } from '../FieldVisitWizard'
import type { SalesEmployee } from '@/lib/supabase/types'

export function StepVisit({
  draft, update, employees,
}: {
  draft: WizardDraft
  update: (p: Partial<WizardDraft>) => void
  employees: SalesEmployee[]
}) {
  return (
    <StepSection>
      <TextField
        label="Visit date" required type="date"
        value={draft.visit_date}
        onChange={(v) => update({ visit_date: v })}
      />
      <SelectField
        label="Sales executive" required
        value={draft.sales_executive_id}
        onChange={(v) => update({ sales_executive_id: v })}
        options={employees.map((e) => ({
          value: e.id,
          label: `${e.full_name}${e.sales_team ? ` · ${e.sales_team}` : ''}`,
        }))}
        placeholder={employees.length ? '— Select —' : 'No sales staff found'}
      />
      <TextField
        label="Territory / zone"
        value={draft.territory_zone}
        onChange={(v) => update({ territory_zone: v })}
        placeholder="e.g. Gulshan, Motijheel"
      />
      <div>
        <FieldLabel>Visit type</FieldLabel>
        <RadioRows<VisitType>
          options={VISIT_TYPE_OPTIONS}
          value={draft.visit_type as VisitType}
          onChange={(v) => update({ visit_type: v })}
          columns={2}
        />
      </div>
    </StepSection>
  )
}
