import Link from 'next/link'
import { AlertTriangle, ClipboardCheck, Plus, Receipt, Users } from 'lucide-react'
import { LsPage } from '@/components/landscaping/LsNav'
import { LsStatus, LsTag } from '@/components/landscaping/LsStatus'
import { PayBillButton } from '@/components/landscaping/PayBillButton'
import { LinkButton, ListRow, LsEmpty, LsSection, Money, StatTile, TAP, fmtTk } from '@/components/landscaping/ui'
import { requirePermission } from '@/lib/auth/permissions'
import { getLsMe, landscapingOverview } from '@/lib/queries/landscaping'
import { myOpenRequisitions } from '@/lib/queries/landscaping-extra-bills'
import { formatReqNo } from '@/lib/landscaping/money'
import { formatBDT } from '@/lib/formatters/currency'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const BILLS_SHOWN = 8

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="border-b border-gray-100 bg-gray-50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <ul className="divide-y divide-gray-100">{children}</ul>
    </div>
  )
}

/** Landscaping → Overview: what's waiting for me, what's owed, cash in hand. */
export default async function LandscapingOverview() {
  await requirePermission('landscaping', 'read')
  const me = await getLsMe()
  const canPrepare = !!me && (me.can_prepare || me.is_admin)
  const canPay = !!me && (me.can_pay || me.is_admin)
  const canAddBill = !!me && (me.can_prepare || me.can_pay || me.is_admin)
  const [o, mine] = await Promise.all([
    landscapingOverview(me),
    canPrepare ? myOpenRequisitions(me) : Promise.resolve({ sentBack: [], drafts: [] }),
  ])
  const myCash = me ? o.floats.find((f) => f.holder === me.user_id)?.balance : undefined
  const reviews = [...o.toApprove.map((r) => ({ ...r, step: 'Approve' as const })), ...o.toCheck.map((r) => ({ ...r, step: 'Check' as const }))]
  const billsToPay = canPay ? [...o.unpaidBills].sort((a, b) => a.bill_date.localeCompare(b.bill_date)) : []
  const waitingCount = reviews.length + mine.sentBack.length + mine.drafts.length + billsToPay.length
  const cashWithAccountants = o.floats.reduce((s, f) => s + f.balance, 0)

  const quick = [
    canAddBill && <LinkButton key="bill" href="/landscaping/bills"><Receipt size={15} /> Add bill</LinkButton>,
    canPay && <LinkButton key="cash" href="/landscaping/cash"><Users size={15} /> Labour / food</LinkButton>,
  ].filter(Boolean)
  // Negative = more paid out of the accountants' cash than was handed to them.
  const cashHint = cashWithAccountants < -0.5
    ? 'More paid out than handed over — record cash given on the Cash page'
    : typeof myCash === 'number' && canPay ? `You hold ${fmtTk(myCash)}` : undefined

  return (
    <LsPage tab="overview" title="Landscaping" subtitle="Garden Centre · Care with Green"
      actions={canPrepare ? <LinkButton href="/landscaping/requisitions/new" variant="primary" className="px-3 sm:px-4"><Plus size={15} /> New requisition</LinkButton> : undefined}>
        {quick.length > 0 && (
          <div className={cn('grid gap-2 sm:flex', quick.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>{quick}</div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Money in this month" value={<Money value={o.moneyInMonth} />} />
          <StatTile label="Money out this month" value={<Money value={o.moneyOutMonth} />} />
          <StatTile label="Unpaid supplier bills" value={<Money value={o.unpaidTotal} kind="owed" />} href="/landscaping/bills?status=unpaid"
            sub={o.unpaidBills.length ? `${o.unpaidBills.length} bill${o.unpaidBills.length === 1 ? '' : 's'}` : 'All paid'} />
          <StatTile label="Cash with accountants" value={fmtTk(cashWithAccountants)} href="/landscaping/cash"
            tone={cashWithAccountants < -0.5 ? 'bad' : 'neutral'} sub={cashHint} />
        </div>

        {o.overBudget.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={15} /> Bills over the approved requisition</p>
            <ul className="mt-1">{o.overBudget.map((r) => (
              <li key={r.id}>
                <Link href={`/landscaping/requisitions/${r.id}`} className={cn(TAP, 'flex items-center hover:underline')}>
                  Req {formatReqNo(r.req_no)} — billed {formatBDT(r.billed)} of {formatBDT(r.total)} approved
                </Link>
              </li>
            ))}</ul>
          </div>
        )}

        <LsSection
          title={<span className="inline-flex items-center gap-1.5"><ClipboardCheck size={15} className="text-forest-700" /> Waiting for you</span>}
          meta={waitingCount ? `${waitingCount}` : undefined}
        >
          {waitingCount === 0 ? (
            <LsEmpty title="Nothing waiting for you" hint="Requisitions to check or approve, ones sent back to you, and bills to pay will show here." />
          ) : (
            <div>
              {reviews.length > 0 && (
                <Group title="To check or approve">
                  {reviews.map((r) => (
                    <ListRow key={r.id} href={`/landscaping/requisitions/${r.id}`} amount={<Money value={r.total} />}>
                      <div className="flex flex-wrap items-center gap-2">
                        <LsTag>{r.step}</LsTag>
                        <span className="font-mono text-sm font-semibold text-gray-900">{formatReqNo(r.req_no)}</span>
                      </div>
                      <p className="truncate text-sm text-gray-600">{r.description}</p>
                    </ListRow>
                  ))}
                </Group>
              )}
              {mine.sentBack.length > 0 && (
                <Group title="Sent back to you">
                  {mine.sentBack.map((r) => (
                    <ListRow key={r.id} href={`/landscaping/requisitions/${r.id}`} amount={<Money value={r.total} />} sub="Fix and send again">
                      <div className="flex flex-wrap items-center gap-2">
                        <LsStatus status={r.status} />
                        <span className="font-mono text-sm font-semibold text-gray-900">{formatReqNo(r.req_no)}</span>
                      </div>
                      <p className="truncate text-sm text-gray-600">{r.description}</p>
                    </ListRow>
                  ))}
                </Group>
              )}
              {mine.drafts.length > 0 && (
                <Group title="Your drafts">
                  {mine.drafts.map((r) => (
                    <ListRow key={r.id} href={`/landscaping/requisitions/${r.id}`} amount={<Money value={r.total} />} sub="Not sent yet">
                      <div className="flex flex-wrap items-center gap-2">
                        <LsStatus status={r.status} />
                        <span className="font-mono text-sm font-semibold text-gray-900">{formatReqNo(r.req_no)}</span>
                      </div>
                      <p className="truncate text-sm text-gray-600">{r.description || 'No description yet'}</p>
                    </ListRow>
                  ))}
                </Group>
              )}
              {billsToPay.length > 0 && (
                <Group title="Bills to pay">
                  {billsToPay.slice(0, BILLS_SHOWN).map((b) => (
                    <ListRow key={b.id} href={`/landscaping/requisitions/${b.requisition_id}`}
                      amount={<Money value={b.amount - b.paid} kind="owed" />} sub="Due"
                      action={<PayBillButton billId={b.id} due={b.amount - b.paid} label={`${b.supplier_name} bill ${b.bill_no ?? ''}`} cashInHand={myCash} />}>
                      <p className="truncate text-sm font-medium text-gray-900">{b.supplier_name}</p>
                      <p className="text-xs text-gray-500">Bill {b.bill_no ?? '—'} · Req {b.req_no ? formatReqNo(b.req_no) : '—'}</p>
                    </ListRow>
                  ))}
                  {billsToPay.length > BILLS_SHOWN && (
                    <li className="px-4 py-2">
                      <Link href="/landscaping/bills?status=unpaid" className={cn(TAP, 'inline-flex items-center text-sm font-medium text-forest-700 hover:underline')}>
                        See all {billsToPay.length} unpaid bills →
                      </Link>
                    </li>
                  )}
                </Group>
              )}
            </div>
          )}
        </LsSection>

        <div className={cn('grid grid-cols-1 gap-4', !canPay && 'lg:grid-cols-2')}>
          <LsSection title="Active projects" meta={o.projects.length ? `${o.projects.length}` : undefined}>
            {o.projects.length === 0 ? (
              <LsEmpty title="No active projects" action={<LinkButton href="/landscaping/projects">Go to projects</LinkButton>} />
            ) : (
              <ul className="divide-y divide-gray-100">{o.projects.map((p) => (
                <ListRow key={p.id} href={`/landscaping/projects/${p.id}`}
                  amount={<Money value={p.f.owedByClient} kind="owed" />} sub="client owes">
                  <p className="text-sm"><span className="font-semibold text-gray-900">{p.code}</span> <span className="text-gray-600">{p.title}</span></p>
                  <p className="text-xs text-gray-500">Spent {p.f.spentPct ?? 0}% of budget</p>
                </ListRow>
              ))}</ul>
            )}
          </LsSection>

          {!canPay && (
            <LsSection title="Unpaid supplier bills" meta={o.unpaidBills.length ? `${o.unpaidBills.length}` : undefined}
              action={o.unpaidBills.length > BILLS_SHOWN ? <Link href="/landscaping/bills?status=unpaid" className={cn(TAP, 'inline-flex items-center px-2 text-xs font-medium text-forest-700 hover:underline')}>See all</Link> : undefined}>
              {o.unpaidBills.length === 0 ? <LsEmpty title="All bills are paid" /> : (
                <ul className="divide-y divide-gray-100">{o.unpaidBills.slice(0, BILLS_SHOWN).map((b) => (
                  <ListRow key={b.id} href={`/landscaping/requisitions/${b.requisition_id}`} amount={<Money value={b.amount - b.paid} kind="owed" />} sub="Due">
                    <p className="truncate text-sm font-medium text-gray-900">{b.supplier_name}</p>
                    <p className="text-xs text-gray-500">Bill {b.bill_no ?? '—'} · Req {b.req_no ? formatReqNo(b.req_no) : '—'}</p>
                  </ListRow>
                ))}</ul>
              )}
            </LsSection>
          )}
        </div>
    </LsPage>
  )
}
