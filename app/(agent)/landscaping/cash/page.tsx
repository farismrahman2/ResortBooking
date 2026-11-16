import Link from 'next/link'
import { Topbar } from '@/components/layout/Topbar'
import { LsPage } from '@/components/landscaping/LsNav'
import { ExpenseForm, GiveCashForm } from '@/components/landscaping/CashForms'
import { ViewPhoto } from '@/components/landscaping/ViewPhoto'
import { LsEmpty, LsSection, LinkButton, Money, StatTile } from '@/components/landscaping/ui'
import { requirePermission } from '@/lib/auth/permissions'
import { cashFloats, getLsMe, listLsMembers, listProjects, listWorkCategories } from '@/lib/queries/landscaping'
import { listExpensesForHolder } from '@/lib/queries/landscaping-extra-projects'
import { formatBDT } from '@/lib/formatters/currency'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const CAT: Record<string, string> = { labour: 'Daily labour', food: 'Food', transport: 'Transport', tools: 'Tools', other: 'Other', before_system: 'Before the system' }

export default async function CashPage({ searchParams }: { searchParams: { holder?: string } }) {
  await requirePermission('landscaping', 'read')
  const [me, { floats, movements: allMoves }, members, projects, categories] = await Promise.all([getLsMe(), cashFloats(), listLsMembers(), listProjects(), listWorkCategories()])
  const holder = floats.find((f) => f.holder === searchParams.holder) ?? null
  const expenses = await listExpensesForHolder(holder?.holder, holder?.name)
  const movements = holder ? allMoves.filter((m) => m.holder === holder.holder) : allMoves
  const open = projects.filter((p) => p.status !== 'completed' && p.status !== 'cancelled')
  const mine = me ? floats.find((f) => f.holder === me.user_id) : undefined
  const others = floats.filter((f) => f !== mine)

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Cash & labour" subtitle="Landscaping · cash with each accountant, daily labour, food and other spending" />
      <LsPage tab="cash">
        <div className="flex flex-wrap gap-2">
          {me && (me.can_pay || me.is_admin) && <ExpenseForm projects={open} categories={categories} />}
          {me?.is_admin && <GiveCashForm holders={members.filter((m) => m.can_pay).map((m) => ({ user_id: m.user_id, name: m.name }))} />}
        </div>

        {mine && (
          <StatTile label="Your cash in hand" value={<Money value={mine.balance} kind="profit" className="text-2xl sm:text-3xl" />} href={`/landscaping/cash?holder=${mine.holder}`}
            sub={<>Given {formatBDT(mine.given)} · spent {formatBDT(mine.spent)}{mine.returned ? ` · returned ${formatBDT(mine.returned)}` : ''}{mine.balance < 0 ? <span className="block font-semibold text-red-600">Spent more than given — check your entries.</span> : ' · tap to see your entries'}</>} />
        )}

        {others.length === 0 && !mine ? (
          <LsSection title="Cash with each accountant"><LsEmpty title="No cash handed out yet." hint={me?.is_admin ? 'Use “Give / take back cash” to hand cash to an accountant.' : undefined} /></LsSection>
        ) : others.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((f) => (
              <Link key={f.holder} href={`/landscaping/cash?holder=${f.holder}`}
                className={cn('block rounded-xl border bg-white px-4 py-3 shadow-sm hover:border-forest-300', holder?.holder === f.holder ? 'border-forest-500 ring-1 ring-forest-500' : 'border-gray-200')}>
                <p className="text-sm font-semibold text-gray-900">{f.name}</p>
                <p className="mt-1 text-2xl font-bold"><Money value={f.balance} kind={f.balance < 0 ? 'profit' : 'plain'} className="text-gray-900" /></p>
                <p className="text-xs text-gray-500">should be in hand</p>
                <p className="mt-2 text-xs text-gray-600">Given {formatBDT(f.given)} · spent {formatBDT(f.spent)}{f.returned ? ` · returned ${formatBDT(f.returned)}` : ''}</p>
                {f.balance < 0 && <p className="mt-1 text-xs font-semibold text-red-600">Spent more than given — check the entries.</p>}
              </Link>
            ))}
          </div>
        )}

        {holder && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-forest-200 bg-forest-50 px-4 py-2 text-sm text-forest-900">
            <span className="min-w-0 flex-1">Showing only <b>{holder.name}</b>’s cash entries.</span>
            <LinkButton href="/landscaping/cash">Show everyone</LinkButton>
          </div>
        )}

        <LsSection title="Labour / food / other spending" meta={holder ? `from ${holder.name}’s cash` : undefined}>
          {expenses.length === 0 ? <LsEmpty title="Nothing recorded yet." hint={holder ? 'No spending from this person’s cash.' : 'Use “Labour / food / other” to record daily labour, food or small spending.'} /> : (
            <ul className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium text-gray-900">{CAT[e.category] ?? e.category}</span>
                      <span className="text-xs text-gray-500">{e.exp_date}</span>
                    </p>
                    {(e.workers || e.description || e.payee) && (
                      <p className="break-words text-gray-700">{e.workers ? `${e.workers} × ${formatBDT(Number(e.rate))}` : ''}{e.workers && (e.description || e.payee) ? ' · ' : ''}{e.description ?? ''}{e.payee ? `${e.description ? ' · ' : ''}${e.payee}` : ''}</p>
                    )}
                    <p className="text-xs text-gray-500">{e.project_code ?? 'Overhead'} · {e.method === 'cash' ? `cash${e.holder_name ? ` (${e.holder_name})` : ''}` : e.method}</p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <Money value={e.amount} className="font-semibold text-gray-900" />
                    {e.photo_path && <ViewPhoto path={e.photo_path} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </LsSection>

        {movements.length > 0 && (
          <LsSection title="Cash handed over / returned">
            <ul className="divide-y divide-gray-100">
              {movements.map((m) => (
                <li key={m.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p>{m.kind === 'given' ? 'Given to' : 'Returned by'} <b>{m.holder_name}</b></p>
                    <p className="text-xs text-gray-500">{m.mov_date}{m.note ? ` · ${m.note}` : ''}</p>
                  </div>
                  <Money value={m.amount} className={cn('flex-shrink-0 font-semibold', m.kind === 'given' ? 'text-gray-900' : 'text-emerald-700')} />
                </li>
              ))}
            </ul>
          </LsSection>
        )}
      </LsPage>
    </div>
  )
}
