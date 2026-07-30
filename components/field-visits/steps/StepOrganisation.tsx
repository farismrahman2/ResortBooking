'use client'

import { useState, useEffect, useRef } from 'react'
import { Building2, Link2, Check } from 'lucide-react'
import { TextField, TextAreaField, SelectField, StepSection } from '../wizard-ui'
import type { WizardDraft } from '../FieldVisitWizard'
import type { FieldVisitBand } from '@/lib/supabase/types-field-visits'
import type { CrmSector } from '@/lib/supabase/types-crm'

interface Match { id: string; company_name: string; account_code: string; parent_name: string | null }

export function StepOrganisation({
  draft, update, sectors, employeeBands,
}: {
  draft: WizardDraft
  update: (p: Partial<WizardDraft>) => void
  sectors: CrmSector[]
  employeeBands: FieldVisitBand[]
}) {
  const [matches, setMatches] = useState<Match[]>([])
  const [dismissed, setDismissed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced duplicate hinting. Fails soft — never interrupts typing.
  useEffect(() => {
    const name = draft.organisation_name.trim()
    if (draft.account_id || dismissed || name.length < 3) { setMatches([]); return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/field-visits/duplicate-accounts?name=${encodeURIComponent(name)}`)
        const json = await res.json()
        setMatches(json.matches ?? [])
      } catch { setMatches([]) }
    }, 450)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [draft.organisation_name, draft.account_id, dismissed])

  const linked = draft.account_id
    ? matches.find((m) => m.id === draft.account_id) ?? null
    : null

  function linkTo(m: Match) {
    // Pre-fill from the account, but everything stays editable.
    update({ account_id: m.id, organisation_name: m.company_name })
    setMatches([])
  }

  return (
    <StepSection>
      <TextField
        label="Organisation name" required
        value={draft.organisation_name}
        onChange={(v) => update({ organisation_name: v, account_id: null })}
        placeholder="e.g. Square Pharmaceuticals Ltd."
      />

      {draft.account_id && (
        <div className="flex items-start gap-2 rounded-xl border border-green-300 bg-green-50 px-3 py-2.5 text-sm text-green-900">
          <Check size={16} className="mt-0.5 flex-shrink-0" />
          <span className="flex-1">
            Linked to an existing CRM account{linked ? ` — ${linked.account_code}` : ''}.
            <button
              type="button"
              onClick={() => update({ account_id: null })}
              className="ml-2 underline"
            >
              Unlink
            </button>
          </span>
        </div>
      )}

      {/* Duplicate hint — never auto-links; the rep decides. */}
      {!draft.account_id && matches.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
            <Building2 size={15} />
            {matches.length} similar account{matches.length > 1 ? 's' : ''} found
          </p>
          <ul className="mt-2 space-y-2">
            {matches.map((m) => (
              <li key={m.id} className="rounded-lg border border-amber-200 bg-white px-3 py-2">
                <p className="text-sm font-medium text-gray-900">{m.company_name}</p>
                <p className="text-xs text-gray-500">
                  {m.account_code}{m.parent_name ? ` · part of ${m.parent_name}` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => linkTo(m)}
                  className="mt-1.5 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white"
                >
                  <Link2 size={12} /> Link to this account
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => { setDismissed(true); setMatches([]) }}
            className="mt-2 min-h-[36px] w-full rounded-lg border border-amber-300 text-xs font-medium text-amber-800"
          >
            This is a new organisation
          </button>
        </div>
      )}

      <TextAreaField
        label="Office address"
        value={draft.office_address}
        onChange={(v) => update({ office_address: v })}
        placeholder="Building, road, area"
      />
      <SelectField
        label="Sector"
        value={draft.sector_id}
        onChange={(v) => update({ sector_id: v })}
        options={sectors.map((s) => ({ value: s.id, label: s.display_name }))}
      />
      <SelectField
        label="Employee count"
        value={draft.employee_band}
        onChange={(v) => update({ employee_band: v })}
        options={employeeBands.map((b) => ({ value: b.code, label: b.label }))}
      />
    </StepSection>
  )
}
