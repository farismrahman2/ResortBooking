'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { Printer, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { num } from '@/lib/kitchen/messages'
import type { VendorSection } from '@/lib/supabase/types-kitchen'

export interface RequisitionPrintHeader {
  id:             string
  requisition_no: string
  event_date:     string   // pre-formatted for display
  raised_on:      string   // pre-formatted for display
  status:         string
  statusLabel:    string
  isEmergency:    boolean
  approverName:   string | null
  notes:          string | null
}

/**
 * The printable requisition — the sheet that goes to the store and gets signed.
 *
 * HTML + `@media print`, NOT @react-pdf/renderer: item names are `English /
 * বাংলা` and @react-pdf breaks Bangla conjuncts (the menus module hit the same
 * wall and settled on this). Chrome's print-to-PDF output is the PDF.
 *
 * Multi-column because the paper form is: 40-odd items down a single column
 * runs to three pages, and the whole point is one sheet the storekeeper can
 * tick off. Two or three columns is the reader's call — Bangla names are long,
 * and three columns is tight once names start wrapping.
 */
export function RequisitionPrintDoc({
  header, sections,
}: {
  header:   RequisitionPrintHeader
  sections: VendorSection[]
}) {
  const [columns, setColumns] = useState<2 | 3>(3)

  const filled = sections.filter((s) => s.lines.length > 0)
  const itemCount = filled.reduce((n, s) => n + s.lines.length, 0)
  const isDraft = header.status === 'draft'

  return (
    <>
      <style>{`
        /* Self-hosted Noto Sans Bengali — item names are half Bangla, and a
           missing font renders them as tofu boxes on the printed sheet.
           Files live in /public/fonts; nothing is fetched at print time. */
        @font-face {
          font-family: 'Noto Sans Bengali';
          font-style: normal; font-weight: 400;
          src: url('/fonts/NotoSansBengali-Regular.woff2') format('woff2');
        }
        @font-face {
          font-family: 'Noto Sans Bengali';
          font-style: normal; font-weight: 700;
          src: url('/fonts/NotoSansBengali-Bold.woff2') format('woff2');
        }
        @font-face {
          font-family: 'Noto Sans Bengali';
          font-style: normal; font-weight: 400 700;
          src: url('/fonts/NotoSansBengali-Latin.woff2') format('woff2');
          unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+20AC, U+2122;
        }

        @page { size: A4; margin: 12mm; }

        .req-doc {
          font-family: 'Noto Sans Bengali', 'SolaimanLipi', sans-serif;
          color: #000;
          background: white;
          max-width: 186mm;
          margin: 0 auto;
        }

        .req-cols {
          column-count: var(--req-cols, 3);
          column-gap: 6mm;
          column-rule: 0.5pt solid #d1d5db;
        }
        /* A vendor's list must not be sliced across a column break — a
           storekeeper reading half a supplier's items misses the rest. */
        .req-group { break-inside: avoid; page-break-inside: avoid; margin-bottom: 3mm; }
        .req-group-head {
          font-weight: 700; font-size: 9pt;
          border-bottom: 1pt solid #000;
          padding-bottom: 1pt; margin-bottom: 1.5pt;
        }
        .req-row {
          display: flex; align-items: baseline; gap: 3pt;
          font-size: 8.5pt; line-height: 1.35;
          border-bottom: 0.4pt dotted #9ca3af;
          padding: 0.6pt 0;
        }
        .req-idx  { width: 12pt; flex: none; color: #4b5563; font-size: 7pt; }
        .req-name { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
        .req-qty  { flex: none; font-weight: 700; white-space: nowrap; }

        .req-watermark {
          position: fixed; inset: 0; z-index: 50;
          display: flex; align-items: center; justify-content: center;
          pointer-events: none;
        }
        .req-watermark span {
          transform: rotate(-30deg); font-size: 78px; font-weight: 700;
          color: rgba(220, 38, 38, 0.10); white-space: nowrap;
        }

        @media print {
          nav, aside, header, .sidebar, [data-sidebar], [data-topbar], .no-print {
            display: none !important;
          }
          body { background: white !important; }
          .req-doc { max-width: none; padding: 0 !important; }
        }
      `}</style>

      {/* Toolbar — screen only */}
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-3 sm:px-6">
        <Link href={`/kitchen/requisitions/${header.id}`}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <ChevronLeft size={15} /> Back to requisition
        </Link>
        <span className="text-gray-300">|</span>
        <span className="text-sm text-gray-700">
          {header.requisition_no} · {itemCount} item{itemCount === 1 ? '' : 's'}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-gray-300">
            {([2, 3] as const).map((c) => (
              <button
                key={c} type="button" onClick={() => setColumns(c)}
                className={cn('min-h-[38px] px-3 text-xs font-medium',
                  columns === c ? 'bg-forest-700 text-white' : 'bg-white text-gray-700')}
              >
                {c} columns
              </button>
            ))}
          </div>
          <button
            type="button" onClick={() => window.print()}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-forest-700 px-3 text-xs font-semibold text-white"
          >
            <Printer size={14} /> Print / Save as PDF
          </button>
        </div>
        <p className="w-full text-[11px] text-gray-500">
          Aim for one sheet. If it spills onto a second page, switch to 3 columns; if the
          Bangla names are wrapping badly, switch to 2.
        </p>
      </div>

      {isDraft && (
        <div className="req-watermark" aria-hidden>
          <span>DRAFT — NOT APPROVED</span>
        </div>
      )}

      {/* ── The sheet ────────────────────────────────────────────────── */}
      <div className="req-doc px-5 py-6 sm:px-8" style={{ '--req-cols': columns } as CSSProperties}>
        <div className="text-center">
          <p className="text-[15pt] font-bold leading-tight">KITCHEN REQUISITION</p>
          <p className="text-[10pt] leading-tight">রান্নাঘরের চাহিদাপত্র</p>
        </div>

        <div className="mt-2 flex flex-wrap justify-between gap-x-4 border-y border-black py-1 text-[9pt]">
          <span><strong>No.</strong> {header.requisition_no}</span>
          <span><strong>For</strong> {header.event_date}</span>
          <span><strong>Raised</strong> {header.raised_on}</span>
          <span>
            <strong>Status</strong> {header.statusLabel}
            {header.approverName ? ` — ${header.approverName}` : ''}
          </span>
          {header.isEmergency && <span className="font-bold">EMERGENCY</span>}
        </div>

        {filled.length === 0 ? (
          <p className="mt-6 text-center text-[10pt]">No items on this requisition.</p>
        ) : (
          <div className="req-cols mt-3">
            {filled.map((s) => (
              <div key={s.vendor.id} className="req-group">
                <div className="req-group-head">
                  {s.vendor.display_name} <span style={{ fontWeight: 400 }}>({s.lines.length})</span>
                </div>
                {s.lines.map((l, i) => (
                  <div key={i} className="req-row">
                    <span className="req-idx">{i + 1}.</span>
                    <span className="req-name">
                      {l.item_name}
                      {l.is_extra && <strong> *</strong>}
                      {l.notes && <span style={{ fontSize: '7pt', color: '#4b5563' }}> — {l.notes}</span>}
                    </span>
                    <span className="req-qty">
                      {num(l.qty)}{l.unit_label ? ` ${l.unit_label}` : ''}
                      {l.piece_count ? ` (${num(l.piece_count)} pcs)` : ''}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {header.notes && (
          <p className="mt-3 border-t border-gray-400 pt-1 text-[8.5pt]">
            <strong>Notes:</strong> {header.notes}
          </p>
        )}

        <div className="mt-2 text-[7.5pt] text-gray-600">
          {itemCount} item{itemCount === 1 ? '' : 's'} across {filled.length} vendor
          {filled.length === 1 ? '' : 's'}. * = added after the original list.
        </div>

        {/* The paper form is signed on receipt — keep the same three hands. */}
        <div className="mt-6 flex justify-between gap-6 text-[8.5pt]">
          {['Prepared by', 'Approved by', 'Received by'].map((role) => (
            <div key={role} className="flex-1">
              <div className="border-t border-black pt-1">{role}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
