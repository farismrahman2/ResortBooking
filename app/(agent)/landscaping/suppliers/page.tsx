import Link from 'next/link'
import { LsPage } from '@/components/landscaping/LsNav'
import { SupplierForm } from '@/components/landscaping/SupplierForm'
import { LinkButton, ListRow, LsEmpty, LsSection, Money, StatTile, fmtTk } from '@/components/landscaping/ui'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, listSuppliers } from '@/lib/queries/landscaping'

export const dynamic = 'force-dynamic'

export default async function SuppliersPage() {
  await requirePermission('landscaping', 'read')
  const [me, suppliers] = await Promise.all([getLsMe(), listSuppliers()])
  const owed = suppliers.reduce((s, x) => s + x.owed, 0)
  const owingCount = suppliers.filter((s) => s.owed > 0.005).length
  const canSetOpening = !!me && (me.is_admin || me.can_pay)
  const subLine = (s: (typeof suppliers)[number]) =>
    `${s.bills} bill${s.bills === 1 ? '' : 's'}${s.opening ? ` · opening dues ${fmtTk(s.opening)}` : ''}`

  return (
    <LsPage tab="suppliers" title="Suppliers" subtitle="Billed, paid and owed" actions={<SupplierForm canSetOpening={canSetOpening} />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Owed to suppliers" value={<Money value={owed} kind="owed" />} tone={owed > 0.005 ? 'owed' : 'neutral'}
            sub={owingCount ? `${owingCount} supplier${owingCount === 1 ? '' : 's'} to pay` : 'Nothing owed'} href="/landscaping/bills?status=unpaid" />
          <StatTile label="Suppliers" value={suppliers.length} />
        </div>

        <LsSection title="All suppliers" meta={`${suppliers.length}`}>
          {suppliers.length === 0 ? (
            <LsEmpty title="No suppliers yet" hint="Suppliers are added with their first bill, or with the Add button at the top."
              action={<LinkButton href="/landscaping/bills">Go to bills</LinkButton>} />
          ) : (
            <>
              {/* Phones: one stacked row per supplier */}
              <ul className="divide-y divide-gray-100 sm:hidden">
                {suppliers.map((s) => (
                  <ListRow key={s.id} href={`/landscaping/suppliers/${s.id}`}
                    amount={<Money value={s.owed} kind="owed" />} sub={s.owed > 0.005 ? 'owed' : 'nothing owed'}>
                    <p className="truncate text-sm font-semibold text-forest-700">{s.name}</p>
                    <p className="text-xs text-gray-500">{subLine(s)}</p>
                    <p className="text-xs text-gray-500">Billed {fmtTk(s.billed)} · paid {fmtTk(s.paid)}</p>
                  </ListRow>
                ))}
              </ul>
              {/* Wider screens: table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr><th className="px-4 py-2 font-medium">Supplier</th><th className="px-2 py-2 text-right font-medium">Billed</th><th className="px-2 py-2 text-right font-medium">Paid</th><th className="px-4 py-2 text-right font-medium">Owed</th></tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s) => (
                      <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <Link href={`/landscaping/suppliers/${s.id}`} className="font-medium text-forest-700 hover:underline">{s.name}</Link>
                          <div className="text-xs text-gray-500">{subLine(s)}</div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right"><Money value={s.billed} /></td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right"><Money value={s.paid} /></td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right"><Money value={s.owed} kind="owed" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </LsSection>
    </LsPage>
  )
}
