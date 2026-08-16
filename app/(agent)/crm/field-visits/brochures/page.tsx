import Link from 'next/link'
import { BookOpen, ChevronLeft, Crown, Phone, Mail } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listBrochureRecipients } from '@/lib/queries/field-visits'
import { WhatsAppLink } from '@/components/ui/WhatsAppLink'
import { MigrationErrorBanner } from '@/components/ui/MigrationErrorBanner'
import { formatDate } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

/**
 * The brochure directory: everyone ever handed a brochure on a field visit,
 * one row per person, newest first. A brochure in someone's hand is a warm
 * lead going cold — this list is who to call.
 */
export default async function BrochureRecipientsPage() {
  await requirePermission('field_visits', 'read')

  try {
    const people = await listBrochureRecipients()

    return (
      <div className="flex h-full flex-col">
        <Topbar
          title="Brochure Recipients"
          subtitle={`${people.length} ${people.length === 1 ? 'person' : 'people'} handed a brochure on a field visit`}
        />
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <div className="mx-auto max-w-4xl space-y-4">
            <Link href="/crm/field-visits" className="inline-flex items-center gap-1 text-sm text-forest-700 hover:underline">
              <ChevronLeft size={15} /> All field visits
            </Link>

            {people.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-gray-300 bg-white px-4 py-12 text-center text-sm text-gray-500">
                Nobody has been handed a brochure yet — it will show here the first time
                a visit is logged with &ldquo;Brochure&rdquo; under materials given.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                        <th className="px-3 py-2 font-semibold">Person</th>
                        <th className="px-3 py-2 font-semibold">Organisation</th>
                        <th className="px-3 py-2 font-semibold">Contact</th>
                        <th className="px-3 py-2 font-semibold">Given on</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {people.map((p, i) => (
                        <tr key={i} className="align-top hover:bg-gray-50/60">
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-gray-900">
                              {p.name}
                              {p.is_decision_maker && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                  <Crown size={9} /> decision maker
                                </span>
                              )}
                            </p>
                            {(p.designation || p.department) && (
                              <p className="text-xs text-gray-500">
                                {[p.designation, p.department].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-gray-800">{p.organisation}</td>
                          <td className="px-3 py-2.5">
                            {p.mobile ? (
                              <p className="flex items-center gap-1.5 text-gray-800">
                                <Phone size={11} className="flex-shrink-0 text-gray-400" />
                                <a href={`tel:${p.mobile}`} className="font-mono tabular-nums hover:underline">{p.mobile}</a>
                                <WhatsAppLink phone={p.mobile} size="sm" />
                              </p>
                            ) : (
                              <p className="text-xs text-gray-400">no number</p>
                            )}
                            {p.email && (
                              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-600">
                                <Mail size={11} className="flex-shrink-0 text-gray-400" />
                                <a href={`mailto:${p.email}`} className="hover:underline">{p.email}</a>
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            <Link href={`/crm/field-visits/${p.visit_id}`} className="text-forest-700 hover:underline">
                              {p.visit_date ? formatDate(p.visit_date) : '—'}
                            </Link>
                            <p className="text-[11px] text-gray-400">{p.visit_ref}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  } catch (err) {
    if (err && typeof err === 'object' && 'digest' in err) throw err
    return (
      <div className="px-4 py-6">
        <MigrationErrorBanner
          error={err instanceof Error ? err.message : String(err)}
          moduleName="Field visits"
          migrationPath="migrations/field-visits-module/000_create_field_visits.sql"
        />
      </div>
    )
  }
}
