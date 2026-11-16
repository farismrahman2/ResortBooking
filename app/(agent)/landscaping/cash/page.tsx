import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { ExpenseForm, GiveCashForm } from '@/components/landscaping/CashForms'
import { ViewPhoto } from '@/components/landscaping/ViewPhoto'
import { requirePermission } from '@/lib/auth/permissions'
import { cashFloats, getLsMe, listExpenses, listLsMembers, listProjects, listWorkCategories } from '@/lib/queries/landscaping'
import { formatBDT } from '@/lib/formatters/currency'

export const dynamic = 'force-dynamic'

const CAT: Record<string, string> = { labour: 'Daily labour', food: 'Food', transport: 'Transport', tools: 'Tools', other: 'Other', before_system: 'Before the system' }

export default async function CashPage() {
  await requirePermission('landscaping', 'read')
  const [me, { floats, movements }, expenses, members, projects, categories] = await Promise.all([getLsMe(), cashFloats(), listExpenses(), listLsMembers(), listProjects(), listWorkCategories()])
  const open = projects.filter((p) => p.status !== 'completed' && p.status !== 'cancelled')
  return (
    <div className="flex h-full flex-col">
      <Topbar title="Cash & labour" subtitle="Landscaping · cash with each accountant, daily labour, food and other spending" />
      <LsPage tab="cash">
        <div className="flex flex-wrap gap-2">
          {me?.is_admin && <GiveCashForm holders={members.filter((m) => m.can_pay).map((m) => ({ user_id: m.user_id, name: m.name }))} />}
          {me && (me.can_pay || me.is_admin) && <ExpenseForm projects={open} categories={categories} />}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {floats.length === 0 && <p className="text-sm text-gray-500">No cash handed out yet.</p>}
          {floats.map((f) => (
            <div key={f.holder} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{f.name}</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900">{formatBDT(f.balance)}</p>
              <p className="text-xs text-gray-500">should be in hand</p>
              <p className="mt-2 text-xs text-gray-600">Given {formatBDT(f.given)} · spent {formatBDT(f.spent)}{f.returned ? ` · returned ${formatBDT(f.returned)}` : ''}</p>
              {f.balance < 0 && <p className="mt-1 text-xs font-semibold text-red-600">Spent more than given — check the entries.</p>}
            </div>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">Labour, food & other spending</h3>
          {expenses.length === 0 ? <p className="px-4 py-4 text-sm text-gray-500">Nothing recorded yet.</p> : (
            <ul className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <span className="text-xs text-gray-500">{e.exp_date}</span>
                  <span className="font-medium text-gray-900">{CAT[e.category] ?? e.category}</span>
                  <span className="min-w-0 flex-1 truncate text-gray-700">{e.workers ? `${e.workers} × ${formatBDT(Number(e.rate))} · ` : ''}{e.description ?? ''}{e.payee ? ` · ${e.payee}` : ''}</span>
                  <span className="text-xs text-gray-500">{e.project_code ?? 'Overhead'} · {e.method === 'cash' ? `cash${e.holder_name ? ` (${e.holder_name})` : ''}` : e.method}</span>
                  {e.photo_path && <ViewPhoto path={e.photo_path} />}
                  <span className="font-semibold tabular-nums">{formatBDT(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {movements.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <h3 className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">Cash handed over / returned</h3>
            <ul className="divide-y divide-gray-100">
              {movements.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="text-xs text-gray-500">{m.mov_date}</span>
                  <span>{m.kind === 'given' ? 'Given to' : 'Returned by'} <b>{m.holder_name}</b>{m.note ? ` · ${m.note}` : ''}</span>
                  <span className={`ml-auto font-semibold tabular-nums ${m.kind === 'given' ? 'text-gray-900' : 'text-emerald-700'}`}>{formatBDT(m.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </LsPage>
    </div>
  )
}
