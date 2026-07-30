'use client'

import { Plus, Trash2, SkipForward } from 'lucide-react'
import { TextField, TextAreaField, StepSection } from '../wizard-ui'
import type { WizardDraft } from '../FieldVisitWizard'

/** CMP — competitor / venue history. Entirely optional; zero rows is valid. */
export function StepVenues({
  draft, update, onSkip,
}: {
  draft: WizardDraft
  update: (p: Partial<WizardDraft>) => void
  onSkip: () => void
}) {
  function setVenue(i: number, patch: Partial<WizardDraft['venues'][number]>) {
    update({ venues: draft.venues.map((v, idx) => (idx === i ? { ...v, ...patch } : v)) })
  }
  function addVenue() {
    update({ venues: [...draft.venues, { venue_name: '', event_month_year: '', pax: '', rate_per_head: '', feedback: '' }] })
  }
  function removeVenue(i: number) {
    update({ venues: draft.venues.filter((_, idx) => idx !== i) })
  }

  return (
    <StepSection>
      <p className="text-sm text-gray-600">
        Where have they held events before? Useful for pricing against the competition —
        but skip it if they can&apos;t recall.
      </p>

      {draft.venues.length === 0 ? (
        <button
          type="button"
          onClick={onSkip}
          className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 text-sm font-semibold text-gray-600"
        >
          <SkipForward size={16} /> Skip — no venue history
        </button>
      ) : null}

      <div className="space-y-3">
        {draft.venues.map((v, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-gray-300 bg-white p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-800">Venue {i + 1}</p>
              <button
                type="button"
                onClick={() => removeVenue(i)}
                aria-label={`Remove venue ${i + 1}`}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-red-500 active:bg-red-50"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <TextField label="Venue name" value={v.venue_name} onChange={(x) => setVenue(i, { venue_name: x })} />
            <TextField label="Month / year" value={v.event_month_year} onChange={(x) => setVenue(i, { event_month_year: x })} placeholder="e.g. Mar 2026" />
            <TextField label="Pax" type="text" inputMode="numeric" value={v.pax} onChange={(x) => setVenue(i, { pax: x.replace(/[^0-9]/g, '') })} />
            <TextField label="Rate per head (BDT)" type="text" inputMode="numeric" value={v.rate_per_head} onChange={(x) => setVenue(i, { rate_per_head: x.replace(/[^0-9]/g, '') })} />
            <TextAreaField label="Their feedback" value={v.feedback} onChange={(x) => setVenue(i, { feedback: x })} rows={2} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addVenue}
        className="flex min-h-[48px] w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-600"
      >
        <Plus size={16} /> Add venue
      </button>
    </StepSection>
  )
}
