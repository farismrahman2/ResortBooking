import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { LsEmpty, LsSection, Money } from '@/components/landscaping/ui'
import { requirePermission } from '@/lib/auth/permissions'
import { cashFloats, itemPriceHistory, listSuppliers, monthlyPnl, projectsWithFinancials, spendAnalysis } from '@/lib/queries/landscaping'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

const TH = 'px-2 py-2 text-right whitespace-nowrap'
const TD = 'px-2 py-2 text-right tabular-nums whitespace-nowrap'

export default async function LandscapingReports() {
  await requirePermission('landscaping', 'read')
  const [months, projects, suppliers, { floats }, spend, prices] = await Promise.all([monthlyPnl(), projectsWithFinancials(), listSuppliers(), cashFloats(), spendAnalysis(), itemPriceHistory()])
  const sum = (k: 'moneyIn' | 'bills' | 'labour' | 'food' | 'other' | 'moneyOut' | 'net') => months.reduce((s, m) => s + m[k], 0)
  const tot = { moneyIn: sum('moneyIn'), bills: sum('bills'), labour: sum('labour'), food: sum('food'), other: sum('other'), moneyOut: sum('moneyOut'), net: sum('net') }
  const owed = suppliers.filter((s) => s.owed > 0)
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Reports" subtitle="Landscaping only — never mixed with the resort" />
      <LsPage tab="reports">
        <LsSection title="Money in and out by month" meta="cash basis" csv="monthly">
          {months.length === 0 ? <LsEmpty title="No money in or out yet." /> : (
            <>
              {/* Phones: one card per month */}
              <ul className="divide-y divide-gray-100 sm:hidden">
                {months.map((m) => (
                  <li key={m.month} className="px-4 py-3 text-sm">
                    <div className="flex items-baseline"><span className="font-semibold text-gray-900">{m.month}</span><span className="ml-auto text-xs text-gray-500">Net <Money value={m.net} kind="profit" className="text-sm" /></span></div>
                    <p className="mt-1 text-xs text-gray-600">In <Money value={m.moneyIn} className="text-emerald-700" /> · Out <Money value={m.moneyOut} className="text-gray-900" /></p>
                    <p className="text-xs text-gray-500">Bills {formatBDT(m.bills)} · labour {formatBDT(m.labour)} · food {formatBDT(m.food)} · other {formatBDT(m.other)}</p>
                  </li>
                ))}
                <li className="bg-gray-50 px-4 py-3 text-sm">
                  <div className="flex items-baseline"><span className="font-semibold">Total</span><span className="ml-auto text-xs text-gray-500">Net <Money value={tot.net} kind="profit" className="text-sm" /></span></div>
                  <p className="mt-1 text-xs text-gray-600">In <Money value={tot.moneyIn} className="text-emerald-700" /> · Out <Money value={tot.moneyOut} className="text-gray-900" /></p>
                </li>
              </ul>
              {/* Tablet / desktop: table with totals */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Month</th><th className={TH}>Client payments</th><th className={TH}>Supplier bills paid</th><th className={TH}>Labour</th><th className={TH}>Food</th><th className={TH}>Other</th><th className="px-4 py-2 text-right">Net</th></tr></thead>
                  <tbody>{months.map((m) => (
                    <tr key={m.month} className="border-t border-gray-100"><td className="whitespace-nowrap px-4 py-2">{m.month}</td>
                      <td className={TD}><Money value={m.moneyIn} className="text-emerald-700" /></td>
                      {[m.bills, m.labour, m.food, m.other].map((v, k) => <td key={k} className={TD}>{formatBDT(v)}</td>)}
                      <td className="whitespace-nowrap px-4 py-2 text-right"><Money value={m.net} kind="profit" /></td></tr>
                  ))}</tbody>
                  <tfoot className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
                    <tr><td className="px-4 py-2">Total</td>
                      <td className={TD}><Money value={tot.moneyIn} className="text-emerald-700" /></td>
                      {[tot.bills, tot.labour, tot.food, tot.other].map((v, k) => <td key={k} className={TD}>{formatBDT(v)}</td>)}
                      <td className="whitespace-nowrap px-4 py-2 text-right"><Money value={tot.net} kind="profit" /></td></tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </LsSection>

        <LsSection title="Profit by project" csv="projects">
          {projects.length === 0 ? <LsEmpty title="No projects yet." /> : (
            <>
              <ul className="divide-y divide-gray-100 sm:hidden">
                {projects.map((p) => p.parent_id ? (
                  <li key={p.id} className="bg-gray-50/60 py-2.5 pl-8 pr-4 text-xs">
                    <p className="text-sm text-gray-800">↳ {p.code} · {p.title}</p>
                    <p className="text-gray-600">Budget {formatBDT(p.budget?.budget ?? 0)} · spent {formatBDT(p.ownF.spent)}{p.budget ? <> · <Money value={p.budget.remaining} kind={p.budget.remaining < 0 ? 'profit' : 'plain'} /> left</> : null}</p>
                  </li>
                ) : (
                  <li key={p.id} className="px-4 py-3 text-sm">
                    <div className="flex items-baseline gap-2"><span className="min-w-0 flex-1 font-medium text-gray-900">{p.code} · {p.title}</span><Money value={p.f.profit} kind="profit" className="flex-shrink-0" /></div>
                    <p className="text-xs text-gray-600">Contract {formatBDT(p.f.contractTotal)} · received {formatBDT(p.f.received)} · spent {formatBDT(p.f.spent)}{p.f.margin !== null ? ` · ${p.f.margin}% margin` : ''}</p>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Project</th><th className={TH}>Contract</th><th className={TH}>Received</th><th className={TH}>Spent</th><th className="px-4 py-2 text-right">Profit</th></tr></thead>
                  <tbody>{projects.map((p) => p.parent_id ? (
                    <tr key={p.id} className="border-t border-gray-100 bg-gray-50/60 text-xs"><td className="py-2 pl-9 pr-4">↳ {p.code} · {p.title}</td>
                      <td className={`${TD} text-gray-500`}>budget {formatBDT(p.budget?.budget ?? 0)}</td>
                      <td className={TD}>{p.ownF.received ? formatBDT(p.ownF.received) : '—'}</td>
                      <td className={TD}>{formatBDT(p.ownF.spent)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-gray-600">{p.budget ? <><Money value={p.budget.remaining} kind={p.budget.remaining < 0 ? 'profit' : 'plain'} /> left of budget</> : ''}</td></tr>
                  ) : (
                    <tr key={p.id} className="border-t border-gray-100"><td className="px-4 py-2">{p.code} · {p.title}{p.subIds.length ? <span className="text-xs text-gray-500"> (incl. sub-projects)</span> : null}</td>
                      <td className={TD}>{formatBDT(p.f.contractTotal)}</td><td className={TD}>{formatBDT(p.f.received)}</td>
                      <td className={TD}>{formatBDT(p.f.spent)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right"><Money value={p.f.profit} kind="profit" />{p.f.margin !== null ? <span className="text-xs text-gray-500"> ({p.f.margin}%)</span> : ''}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </>
          )}
        </LsSection>

        <LsSection title="Where the money went — by work category" csv="categories">
          <p className="px-4 pt-3 text-xs text-gray-500">Supplier bills (by their requisition’s category) plus labour, food and other spending. Sub-projects count in their main project.</p>
          {spend.overall.length === 0 ? <LsEmpty title="No spending yet." /> : (
            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
              {[{ project: 'All projects', total: spend.overall.reduce((s, r) => s + r.amount, 0), rows: spend.overall }, ...spend.byProject].map((p) => (
                <div key={p.project} className="rounded-lg border border-gray-100">
                  <div className="flex border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700"><span>{p.project}</span><Money value={p.total} className="ml-auto" /></div>
                  <ul className="space-y-1.5 p-3">{p.rows.map((r) => (
                    <li key={r.key} className="text-xs">
                      <div className="flex gap-2"><span className={`min-w-0 ${r.key === 'Not set' ? 'italic text-gray-400' : 'text-gray-700'}`}>{r.key}</span><span className="ml-auto whitespace-nowrap tabular-nums text-gray-900">{formatBDT(r.amount)} <span className="text-gray-400">· {r.pct}%</span></span></div>
                      <div className="mt-0.5 h-1.5 rounded-full bg-gray-100"><div className="h-1.5 rounded-full bg-forest-600" style={{ width: `${Math.max(r.pct, 1)}%` }} /></div>
                    </li>
                  ))}</ul>
                </div>
              ))}
            </div>
          )}
        </LsSection>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LsSection title="Requisitions by who asked" csv="requesters">
            {spend.byRequester.length === 0 ? <LsEmpty title="No approved requisitions yet." /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Requested by</th><th className={TH}>Approved</th><th className={TH}>Approved total</th><th className="px-4 py-2 text-right">Billed</th></tr></thead>
                  <tbody>{spend.byRequester.map((r) => (
                    <tr key={r.name} className="border-t border-gray-100"><td className="px-4 py-2">{r.name}</td><td className={TD}>{r.count}</td>
                      <td className={TD}>{formatBDT(r.approved)}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right"><Money value={r.billed} className={r.billed > r.approved + 0.005 ? 'font-semibold text-red-600' : ''} /></td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </LsSection>
          <LsSection title="Item rates over time" csv="prices">
            {prices.length === 0 ? <LsEmpty title="No bills with item rates yet." /> : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs text-gray-500"><tr><th className="px-4 py-2">Item</th><th className={TH}>Times</th><th className={TH}>First → last</th><th className={`${TH} hidden sm:table-cell`}>Low – high</th><th className="px-4 py-2 text-right">Change</th></tr></thead>
                    <tbody>{prices.slice(0, 40).map((i) => (
                      <tr key={i.item} className="border-t border-gray-100"><td className="px-4 py-2">{i.item}{i.unit ? <span className="text-xs text-gray-500"> / {i.unit}</span> : null}</td>
                        <td className={TD}>{i.times}</td>
                        <td className={TD}>{formatBDT(i.first)} → {formatBDT(i.last)}</td>
                        <td className={`${TD} hidden text-gray-500 sm:table-cell`}>{formatBDT(i.low)} – {formatBDT(i.high)}</td>
                        <td className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${i.changePct && i.changePct > 15 ? 'font-semibold text-red-600' : i.changePct && i.changePct < 0 ? 'text-emerald-700' : ''}`}>{i.changePct === null || i.times < 2 ? '—' : `${i.changePct > 0 ? '+' : ''}${i.changePct}%`}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
                {prices.length > 40 && <p className="px-4 py-2 text-xs text-gray-500">Showing the 40 most-bought items — the CSV has every line with supplier and project.</p>}
              </>
            )}
          </LsSection>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LsSection title="Owed to suppliers" meta={owed.length ? <>Due <Money value={owed.reduce((s, x) => s + x.owed, 0)} kind="owed" /></> : undefined} csv="suppliers">
            {owed.length === 0 ? <LsEmpty title="Nothing due to suppliers." /> : (
              <ul className="divide-y divide-gray-100">{owed.map((s) => (
                <li key={s.id} className="flex gap-3 px-4 py-2.5 text-sm"><span className="min-w-0 flex-1">{s.name}</span><Money value={s.owed} kind="owed" className="flex-shrink-0" /></li>
              ))}</ul>
            )}
          </LsSection>
          <LsSection title="Cash with each accountant">
            {floats.length === 0 ? <LsEmpty title="No cash handed out yet." /> : (
              <ul className="divide-y divide-gray-100">{floats.map((f) => (
                <li key={f.holder} className="flex gap-3 px-4 py-2.5 text-sm"><span className="min-w-0 flex-1">{f.name}</span><Money value={f.balance} className={`flex-shrink-0 font-semibold ${f.balance < 0 ? 'text-red-600' : ''}`} /></li>
              ))}</ul>
            )}
          </LsSection>
        </div>
      </LsPage>
    </div>
  )
}
