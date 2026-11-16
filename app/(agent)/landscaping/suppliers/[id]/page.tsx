import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MapPin, Phone } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { SupplierForm } from '@/components/landscaping/SupplierForm'
import { PayBillButton } from '@/components/landscaping/PayBillButton'
import { ViewPhoto } from '@/components/landscaping/ViewPhoto'
import { LsStatus } from '@/components/landscaping/LsStatus'
import { LinkButton, ListRow, LsEmpty, LsSection, Money, StatTile, TAP } from '@/components/landscaping/ui'
import { WhatsAppLink } from '@/components/ui/WhatsAppLink'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, getSupplierLedger } from '@/lib/queries/landscaping'
import { myCashInHand } from '@/lib/queries/landscaping-extra-bills'
import { formatReqNo } from '@/lib/landscaping/money'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function SupplierLedgerPage({ params }: { params: { id: string } }) {
  await requirePermission('landscaping', 'read')
  const [me, data] = await Promise.all([getLsMe(), getSupplierLedger(params.id)])
  if (!data) notFound()
  const { supplier, ledger, bills } = data
  const canPay = !!me && (me.can_pay || me.is_admin)
  const cash = canPay ? await myCashInHand(me) : null
  const reqOf = new Map(bills.map((b) => [b.id, b]))
  const unpaid = bills.filter((b) => b.status !== 'paid').sort((a, b) => a.bill_date.localeCompare(b.bill_date))
  const phone: string | null = supplier.phone?.trim() || null

  return (
    <div className="flex h-full flex-col">
      <Topbar title={supplier.name} subtitle="Landscaping · supplier ledger" />
      <LsPage tab="suppliers">
        <Link href="/landscaping/suppliers" className={cn(TAP, 'inline-flex items-center text-sm font-medium text-forest-700 hover:underline')}>← All suppliers</Link>

        {/* Contact + edit */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">{supplier.name}</p>
            {supplier.address && <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500"><MapPin size={12} /> {supplier.address}</p>}
            {!phone && <p className="mt-0.5 text-xs text-gray-500">No phone number saved.</p>}
          </div>
          {phone && (
            <>
              <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={cn(TAP, 'inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50')}>
                <Phone size={14} /> Call {phone}
              </a>
              <WhatsAppLink phone={phone} className={TAP} />
            </>
          )}
          <SupplierForm supplier={supplier} canSetOpening={!!me && (me.is_admin || me.can_pay)} />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Owed now" value={<Money value={data.owed} kind="owed" />} />
          <StatTile label="Billed" value={<Money value={data.billed} />} />
          <StatTile label="Paid" value={<Money value={data.paid} />} tone="good" />
          <StatTile label="Opening dues" value={<Money value={data.opening} />} sub="before the system" />
        </div>

        {unpaid.length > 0 && (
          <LsSection title="Unpaid bills" meta={<>{unpaid.length} · due <Money value={unpaid.reduce((s, b) => s + (b.amount - b.paid), 0)} kind="owed" /></>}>
            <ul className="divide-y divide-gray-100">
              {unpaid.map((b) => (
                <ListRow key={b.id} href={`/landscaping/requisitions/${b.requisition_id}`}
                  amount={<Money value={b.amount - b.paid} kind="owed" />} sub={b.paid > 0 ? <>of <Money value={b.amount} /></> : 'Due'}
                  action={canPay ? <PayBillButton billId={b.id} due={b.amount - b.paid} label={`${supplier.name} bill ${b.bill_no ?? ''}`} cashInHand={cash} /> : undefined}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">Bill {b.bill_no ?? '—'}</span>
                    <LsStatus status={b.status} />
                  </div>
                  <p className="text-xs text-gray-500">{b.bill_date} · Req {b.req_no ? formatReqNo(b.req_no) : '—'}{b.project_code ? ` · ${b.project_code}` : ''}</p>
                </ListRow>
              ))}
            </ul>
          </LsSection>
        )}

        <LsSection title="Ledger" meta="Bills add to what we owe; payments take it down.">
          {ledger.length === 0 ? (
            <LsEmpty title="No bills or payments yet"
              hint={data.opening ? 'Only the opening dues so far. Bills for this supplier will show here once added.' : 'Bills for this supplier will show here once added against a requisition.'}
              action={<LinkButton href="/landscaping/bills">Go to bills</LinkButton>} />
          ) : (
            <>
              {/* Phones: stacked lines */}
              <ul className="divide-y divide-gray-100 sm:hidden">
                <li className="flex items-center gap-3 bg-gray-50 px-4 py-2 text-xs text-gray-500">
                  <span className="flex-1">Opening dues</span><Money value={data.opening} />
                </li>
                {ledger.map((l, k) => {
                  const b = reqOf.get(l.billId)
                  return (
                    <ListRow key={k} href={b ? `/landscaping/requisitions/${b.requisition_id}` : undefined}
                      amount={l.debit ? <Money value={l.debit} /> : <span className="text-emerald-700">Paid <Money value={l.credit} /></span>}
                      sub={<>Balance <Money value={l.balance} kind="owed" /></>}>
                      <p className="text-sm text-gray-900">{l.kind === 'bill' ? 'Bill' : 'Payment'}</p>
                      <p className="truncate text-xs text-gray-500">{l.date} · {l.ref}</p>
                    </ListRow>
                  )
                })}
              </ul>
              {/* Wider screens: table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr><th className="px-4 py-2 font-medium">Date</th><th className="px-2 py-2 font-medium">Entry</th><th className="px-2 py-2 text-right font-medium">Bill</th><th className="px-2 py-2 text-right font-medium">Paid</th><th className="px-4 py-2 text-right font-medium">Balance</th></tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-gray-100 text-gray-500"><td className="px-4 py-2" colSpan={4}>Opening dues</td><td className="px-4 py-2 text-right"><Money value={data.opening} /></td></tr>
                    {ledger.map((l, k) => {
                      const b = reqOf.get(l.billId)
                      return (
                        <tr key={k} className="border-t border-gray-100">
                          <td className="whitespace-nowrap px-4 py-2 text-gray-600">{l.date}</td>
                          <td className="px-2 py-2">
                            {b ? <Link href={`/landscaping/requisitions/${b.requisition_id}`} className="text-forest-700 hover:underline">{l.ref}</Link> : l.ref}
                            {l.kind === 'bill' && b?.photo_path && <span className="ml-2"><ViewPhoto path={b.photo_path} /></span>}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right">{l.debit ? <Money value={l.debit} /> : ''}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-right">{l.credit ? <Money value={l.credit} className="text-emerald-700" /> : ''}</td>
                          <td className="whitespace-nowrap px-4 py-2 text-right font-medium"><Money value={l.balance} kind="owed" /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </LsSection>
      </LsPage>
    </div>
  )
}
