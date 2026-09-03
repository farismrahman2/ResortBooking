import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getQuoteById } from '@/lib/queries/quotes'
import { getSettings } from '@/lib/queries/settings'
import { PrintLayout } from '@/components/print/PrintLayout'
import { PrintTrigger } from './PrintTrigger'

interface PrintPageProps {
  params: { id: string }
}

export default async function QuotePrintPage({ params }: PrintPageProps) {
  const [quote, settings] = await Promise.all([
    getQuoteById(params.id),
    getSettings(),
  ])

  if (!quote) notFound()

  return (
    <>
      {/* Hide sidebar and topbar when printing */}
      <style>{`
        /* Chrome remembers the last print job's layout, so a report printed
           landscape leaves the next quotation coming out sideways and shrunk.
           Pin the orientation. A zero page margin also stops Chrome adding its
           own date / URL header and footer; the wrapper carries the real margin.
           No fixed paper size — forcing A4 against a phone's Letter default
           produced blank pages elsewhere. */
        @page {
          size: portrait;
          margin: 0;
        }
        @media print {
          /* Hide everything outside the print layout */
          nav, aside, header, .sidebar, [data-sidebar], [data-topbar] {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .print-page-wrapper {
            padding: 10mm 12mm !important;
          }
        }
      `}</style>

      {/* Back / Print controls — hidden during print */}
      <div className="no-print flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-3">
        <Link
          href={`/quotes/${quote.id}`}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          ← Back to quote
        </Link>
        <span className="text-gray-300">|</span>
        <span className="text-sm font-medium text-gray-700">
          Quote #{quote.quote_number}
        </span>
        <div className="ml-auto">
          <PrintTrigger />
        </div>
      </div>

      {/* Print content */}
      <div className="print-page-wrapper bg-gray-100 px-4 py-6 print:bg-white print:p-0">
        <PrintLayout quote={quote} settings={settings} />
      </div>
    </>
  )
}
