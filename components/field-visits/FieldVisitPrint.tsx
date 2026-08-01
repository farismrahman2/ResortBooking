'use client'

import { useEffect } from 'react'
import { formatDate } from '@/lib/formatters/dates'
import type { FieldVisitWithChildren } from '@/lib/supabase/types-field-visits'

/**
 * One-page print view mirroring Form GCR-CS-01 Rev 4.0 section for section,
 * so a printed copy can be filed alongside the paper originals. Field codes
 * are printed next to each label — that's the whole point of the layout.
 */
export function FieldVisitPrint({
  visit, sectorName, execName, ownerName, employeeBandLabel, budgetBandLabel,
}: {
  visit: FieldVisitWithChildren
  sectorName: string | null
  execName: string | null
  ownerName: string | null
  employeeBandLabel: string | null
  budgetBandLabel: string | null
}) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [])

  const L = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? '—' : String(v))
  const A = (v: string[] | null | undefined) => (v && v.length ? v.join(', ') : '—')

  return (
    <div className="mx-auto max-w-[820px] bg-white p-6 text-[11px] leading-snug text-black print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print mb-4 flex justify-end">
        <button onClick={() => window.print()} className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium">
          Print
        </button>
      </div>

      <header className="mb-3 border-b-2 border-black pb-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-base font-bold uppercase tracking-wide">Garden Centre Resort</h1>
            <p className="text-[10px] uppercase tracking-wider">Field Sales — Lead Discovery</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-sm font-bold">{visit.visit_ref}</p>
            <p className="text-[9px]">Form GCR-CS-01 Rev 4.0</p>
            <p className="text-[9px] uppercase">{visit.status}</p>
          </div>
        </div>
      </header>

      <Sec title="A — Visit">
        <F c="VIS"    k="Visit date"  v={visit.visit_date ? formatDate(visit.visit_date) : '—'} />
        <F c="VIS"    k="Executive"   v={L(execName)} />
        <F c="VIS"    k="Territory"   v={L(visit.territory_zone)} />
        <F c="VIS.01" k="Visit type"  v={L(visit.visit_type?.replace(/_/g, ' '))} />
      </Sec>

      <Sec title="B — Organisation">
        <F c="ORG.01" k="Organisation" v={L(visit.organisation_name)} wide />
        <F c="ORG.02" k="Address"      v={L(visit.office_address)} wide />
        <F c="ORG.03" k="Sector"       v={L(sectorName)} />
        <F c="ORG.04" k="Employees"    v={L(employeeBandLabel)} />
      </Sec>

      <Sec title="C — Contacts">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-y border-black">
              <th className="py-1 text-left font-semibold">Name (CON.01)</th>
              <th className="py-1 text-left font-semibold">Designation (CON.02)</th>
              <th className="py-1 text-left font-semibold">Mobile / Email (CON.03)</th>
              <th className="py-1 text-left font-semibold">DM</th>
            </tr>
          </thead>
          <tbody>
            {visit.contacts.length === 0 ? (
              <tr><td colSpan={4} className="py-2 text-center text-gray-500">No contacts recorded</td></tr>
            ) : visit.contacts.map((c) => (
              <tr key={c.id} className="border-b border-gray-300">
                <td className="py-1">{L(c.name)}</td>
                <td className="py-1">{L(c.designation)}{c.department ? ` · ${c.department}` : ''}</td>
                <td className="py-1">{[c.mobile, c.email].filter(Boolean).join(' / ') || '—'}</td>
                <td className="py-1">{c.is_decision_maker ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-1.5 grid grid-cols-2 gap-x-4">
          <F c="CON.04" k="Sign-off"  v={A(visit.decision_signoff)} />
        </div>
      </Sec>

      <Sec title="D — Requirements">
        <F c="REQ.01" k="Event types"  v={A(visit.event_types)} wide />
        <F c="REQ.02" k="Per year"     v={L(visit.events_per_year)} />
        <F c="REQ.03" k="Headcount"    v={L(visit.typical_headcount)} />
        <F c="REQ.04" k="Format"       v={A(visit.event_format)} />
        <F c="REQ.05" k="Preferred day" v={A(visit.preferred_day)} />
        <F c="REQ.06" k="Budget/head"  v={L(budgetBandLabel)} />
        <F c="REQ.07" k="Rooms"        v={L(visit.rooms_needed)} />
        <F c="REQ.08" k="Annual spend" v={L(visit.annual_event_spend)} />
        <F c="REQ.09" k="Peak months"  v={A(visit.peak_months)} wide />
      </Sec>

      <Sec title="E — Current venues (CMP)">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="border-y border-black">
              <th className="py-1 text-left font-semibold">Venue</th>
              <th className="py-1 text-left font-semibold">Month / Year</th>
              <th className="py-1 text-right font-semibold">Pax</th>
              <th className="py-1 text-right font-semibold">Rate/head</th>
              <th className="py-1 text-left font-semibold">Feedback</th>
            </tr>
          </thead>
          <tbody>
            {visit.venues.length === 0 ? (
              <tr><td colSpan={5} className="py-2 text-center text-gray-500">None recorded</td></tr>
            ) : visit.venues.map((v) => (
              <tr key={v.id} className="border-b border-gray-300">
                <td className="py-1">{L(v.venue_name)}</td>
                <td className="py-1">{L(v.event_month_year)}</td>
                <td className="py-1 text-right">{L(v.pax)}</td>
                <td className="py-1 text-right">{L(v.rate_per_head)}</td>
                <td className="py-1">{L(v.feedback)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Sec>

      <Sec title="F — Outcome">
        <F c="OUT.01" k="Interest"    v={L(visit.interest_level)} />
        <F c="OUT.02" k="Materials"   v={A(visit.materials_given)} />
        <F c="OUT.03" k="Next month"  v={L(visit.next_event_month)} />
        <F c="OUT.04" k="Next type"   v={L(visit.next_event_type)} />
        <F c="OUT.05" k="Next pax"    v={L(visit.next_event_pax)} />
        <F c="OUT.06" k="Next step"   v={A(visit.next_step)} wide />
        <F c="OUT.07" k="Due by"      v={visit.due_by ? formatDate(visit.due_by) : '—'} />
        <F c="OUT.08" k="Owner"       v={L(ownerName)} />
      </Sec>

      <footer className="mt-4 flex justify-between border-t border-black pt-2 text-[9px]">
        <span>
          {visit.submitted_at ? `Submitted ${formatDate(visit.submitted_at.slice(0, 10))}` : 'Not yet submitted'}
          {visit.gps_lat && visit.gps_lng ? ` · GPS ${visit.gps_lat.toFixed(4)}, ${visit.gps_lng.toFixed(4)}` : ''}
        </span>
        <span>Rep signature: ______________________</span>
      </footer>
    </div>
  )
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-3 break-inside-avoid">
      <h2 className="mb-1 bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">{title}</h2>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">{children}</div>
    </section>
  )
}

function F({ c, k, v, wide }: { c: string; k: string; v: string; wide?: boolean }) {
  return (
    <div className={`flex gap-1.5 border-b border-dotted border-gray-400 py-0.5 ${wide ? 'col-span-2' : ''}`}>
      <span className="w-12 flex-shrink-0 font-mono text-[8px] text-gray-500">{c}</span>
      <span className="w-24 flex-shrink-0 text-gray-600">{k}</span>
      <span className="flex-1 font-medium">{v}</span>
    </div>
  )
}
