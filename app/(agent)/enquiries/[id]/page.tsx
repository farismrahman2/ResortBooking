import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { WhatsAppLink } from '@/components/ui/WhatsAppLink'
import { requirePermission, hasPermission } from '@/lib/auth/permissions'
import { getEnquiry } from '@/lib/queries/enquiries'
import { EnquiryStatusActions } from '@/components/enquiries/EnquiryStatusActions'
import { EnquiryNotes } from '@/components/enquiries/EnquiryNotes'
import { MarkSeen } from '@/components/enquiries/MarkSeen'

export const dynamic = 'force-dynamic'

function fmt(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-800">{children}</dd>
    </div>
  )
}

export default async function EnquiryDetailPage({ params }: { params: { id: string } }) {
  await requirePermission('enquiries', 'read')
  const canWrite = await hasPermission('enquiries', 'write')

  const enquiry = await getEnquiry(params.id)
  if (!enquiry) notFound()

  const source = (enquiry.source ?? {}) as Record<string, unknown>
  const sourceEntries = Object.entries(source).filter(([, v]) => v != null && v !== '')

  return (
    <div className="flex h-full flex-col">
      <MarkSeen id={enquiry.id} alreadySeen={!!enquiry.seen_at} />
      <Topbar title={enquiry.name} subtitle={`${enquiry.type} enquiry`} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <Link
          href="/enquiries"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={15} /> Back to enquiries
        </Link>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Lead details */}
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Lead details</CardTitle>
              </CardHeader>
              <dl className="grid grid-cols-2 gap-4 p-4 pt-0 sm:grid-cols-3">
                <Field label="Name">{enquiry.name}</Field>
                <Field label="Type">{enquiry.type}</Field>
                <Field label="Pax">{enquiry.pax}</Field>
                <Field label="Phone">
                  <span className="inline-flex items-center gap-2">
                    <a href={`tel:${enquiry.phone}`} className="text-forest-800 hover:underline">
                      {enquiry.phone}
                    </a>
                    <WhatsAppLink phone={enquiry.phone} size="sm" />
                  </span>
                </Field>
                <Field label="Email">
                  {enquiry.email ? (
                    <a href={`mailto:${enquiry.email}`} className="text-forest-800 hover:underline">
                      {enquiry.email}
                    </a>
                  ) : '—'}
                </Field>
                <Field label="Preferred date">{enquiry.date_text || '—'}</Field>
                <Field label="Organisation">{enquiry.organisation || '—'}</Field>
                <Field label="Submitted">{fmt(enquiry.submitted_at ?? enquiry.created_at)}</Field>
              </dl>
              {enquiry.note && (
                <div className="border-t border-gray-100 p-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Message
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{enquiry.note}</dd>
                </div>
              )}
              {sourceEntries.length > 0 && (
                <div className="border-t border-gray-100 p-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Source</dt>
                  <dd className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    {sourceEntries.map(([k, v]) => (
                      <span key={k}>
                        <span className="text-gray-400">{k}:</span> {String(v)}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Internal notes</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0">
                <EnquiryNotes id={enquiry.id} notes={enquiry.staff_notes} canWrite={canWrite} />
              </div>
            </Card>
          </div>

          {/* Status column */}
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <div className="p-4 pt-0">
                <EnquiryStatusActions id={enquiry.id} current={enquiry.status} canWrite={canWrite} />
                <p className="mt-4 text-xs text-gray-400">
                  Last updated {fmt(enquiry.updated_at)}
                </p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
