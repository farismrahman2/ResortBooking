'use client'

import { useState } from 'react'
import { Plus, Trash2, ChevronDown, ChevronUp, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TextField, StepSection, FieldLabel, ChipGroup } from '../wizard-ui'
import { DECISION_SIGNOFF_OPTIONS, CHANNEL_OPTIONS } from '@/lib/supabase/types-field-visits'
import type { WizardDraft } from '../FieldVisitWizard'

export function StepContacts({
  draft, update,
}: {
  draft: WizardDraft
  update: (p: Partial<WizardDraft>) => void
}) {
  // Filled cards collapse to "Name · Designation" to keep the screen short.
  const [open, setOpen] = useState<number[]>([0])

  function setContact(i: number, patch: Partial<WizardDraft['contacts'][number]>) {
    const next = draft.contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    update({ contacts: next })
  }

  /** Decision maker is single-select across all cards. */
  function setDecisionMaker(i: number) {
    update({ contacts: draft.contacts.map((c, idx) => ({ ...c, is_decision_maker: idx === i })) })
  }

  function addContact() {
    update({ contacts: [...draft.contacts, { name: '', designation: '', department: '', mobile: '', email: '', is_decision_maker: false }] })
    setOpen((o) => [...o, draft.contacts.length])
  }

  function removeContact(i: number) {
    update({ contacts: draft.contacts.filter((_, idx) => idx !== i) })
    setOpen((o) => o.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)))
  }

  return (
    <StepSection>
      <div className="space-y-3">
        {draft.contacts.map((c, i) => {
          const isOpen = open.includes(i)
          const filled = c.name.trim().length > 0
          return (
            <div key={i} className={cn(
              'rounded-xl border', c.is_decision_maker ? 'border-amber-400 bg-amber-50/40' : 'border-gray-300 bg-white',
            )}>
              <button
                type="button"
                onClick={() => setOpen((o) => (isOpen ? o.filter((x) => x !== i) : [...o, i]))}
                className="flex min-h-[48px] w-full items-center gap-2 px-3 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {filled ? c.name : `Contact ${i + 1}`}
                    {c.is_decision_maker && <Star size={12} className="ml-1 inline fill-amber-500 text-amber-500" />}
                  </span>
                  {filled && c.designation && (
                    <span className="block truncate text-xs text-gray-500">{c.designation}</span>
                  )}
                </span>
                {isOpen ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-gray-200 px-3 py-3">
                  <TextField label="Name" value={c.name} onChange={(v) => setContact(i, { name: v })} />
                  <TextField label="Designation" value={c.designation} onChange={(v) => setContact(i, { designation: v })} />
                  <TextField label="Department" value={c.department} onChange={(v) => setContact(i, { department: v })} />
                  <TextField label="Mobile" type="tel" inputMode="tel" value={c.mobile} onChange={(v) => setContact(i, { mobile: v })} />
                  <TextField label="Email" type="email" inputMode="email" value={c.email} onChange={(v) => setContact(i, { email: v })} />

                  <button
                    type="button"
                    onClick={() => setDecisionMaker(i)}
                    className={cn(
                      'flex min-h-[44px] w-full items-center gap-2 rounded-xl border px-3 text-sm font-medium',
                      c.is_decision_maker
                        ? 'border-amber-500 bg-amber-100 text-amber-900'
                        : 'border-gray-300 bg-white text-gray-700',
                    )}
                  >
                    <Star size={15} className={c.is_decision_maker ? 'fill-amber-500 text-amber-500' : 'text-gray-400'} />
                    Decision maker
                  </button>

                  {draft.contacts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeContact(i)}
                      className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 text-sm font-medium text-red-600"
                    >
                      <Trash2 size={14} /> Remove contact
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={addContact}
        className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600"
      >
        <Plus size={16} /> Add contact
      </button>

      <div>
        <FieldLabel>Who signs off on venue decisions?</FieldLabel>
        <ChipGroup
          options={DECISION_SIGNOFF_OPTIONS}
          value={draft.decision_signoff}
          onChange={(next) => update({ decision_signoff: next })}
        />
      </div>

      <TextField
        label="Best time to call"
        value={draft.best_time_to_call}
        onChange={(v) => update({ best_time_to_call: v })}
        placeholder="e.g. after 3pm, Sun–Thu"
      />

      <div>
        <FieldLabel>Preferred contact channel</FieldLabel>
        <ChipGroup
          options={CHANNEL_OPTIONS}
          value={draft.preferred_channel}
          onChange={(next) => update({ preferred_channel: next })}
        />
      </div>
    </StepSection>
  )
}
