import Link from 'next/link'
import { LsPage } from '@/components/landscaping/LsNav'
import { ExpenseForm, GiveCashForm } from '@/components/landscaping/CashForms'
import { ViewPhoto } from '@/components/landscaping/ViewPhoto'
import { LsEmpty, LsSection, LinkButton, Money, StatTile, fmtDay, fmtTk } from '@/components/landscaping/ui'
import { requirePermission } from '@/lib/auth/permissions'
import { cashFloats, getLsMe, listLsMembers, listProjects, listWorkCategories } from '@/lib/queries/landscaping'
import { listExpensesForHolder } from '@/lib/queries/landscaping-extra-projects'
import { formatBDT } from '@/lib/formatters/currency'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const CAT: Record<string, string> = { labour: 'Daily labour', food: 'Food', transport: 'Transport', tools: 'Tools', other: 'Other', before_system: 'Before the system' }

type Float = { holder: string; name: string; balance: number; given: number; spent: number; returned: number }

/** "Given ৳X · spent ৳Y · returned ৳Z" */
const flow = (f: Float) => `Given ${formatBDT(f.given)} · spent ${formatBDT(f.spent)}${f.returned ? ` · returned ${formatBDT(f.returned)}` : ''}`

/**
 * Plain words for a cash balance below zero: what it means and what to do.
 * Usually the cash handed over was never recorded.
 */
function ShortNote({ f, self, isAdmin }: { f: Float; self: boolean; isAdmin: boolean }) {
  const over = formatBDT(Math.abs(f.balance))
  return (
    <span className="mt-1 block max-w-xl rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
      {self ? 'You have' : `${f.name} has`} paid out <b>{over}</b> more than {self ? 'you were' : 'they were'} given.
      {' '}Usually this means the cash handed over was not recorded.{' '}
      <b>
        {isAdmin
          ? `Record the cash handed to ${self ? 'you' : 'them'} with “Give cash”.`
          : self ? 'Ask the admin to record the cash given to you.' : 'Ask the admin to check.'}
      </b>
    </span>
  )
}

export default async function CashPage({ searchParams }: { searchParams: { holder?: string } }) {
  await requirePermission('landscaping', 'read')
  const [me, { floats, movements: allMoves }, members, projects, categories] = await Promise.all([getLsMe(), cashFloats(), listLsMembers(), listProjects(), listWorkCategories()])
  const holder = floats.find((f) => f.holder === searchParams.holder) ?? null
  const expenses = await listExpensesForHolder(holder?.holder, holder?.name)
  const movements = holder ? allMoves.filter((m) => m.holder === holder.holder) : allMoves
  const open = projects.filter((p) => p.status !== 'completed' && p.status !== 'cancelled')
  const mine = me ? floats.find((f) => f.holder === me.user_id) : undefined
  const others = floats.filter((f) => f !== mine)
  const isAdmin = !!me?.is_admin
  const canSpend = !!me && (me.can_pay || me.is_admin)
  const giveCash = isAdmin
    ? <GiveCashForm holders={members.filter((m) => m.can_pay).map((m) => ({ user_id: m.user_id, name: m.name }))} />
    : undefined

  return (
    <LsPage tab="cash" title="Cash & spending" subtitle="Cash in hand, labour, food and other"
      actions={canSpend ? <ExpenseForm projects={open} categories={categories} /> : undefined}>

        {mine && (
          <StatTile label="Your cash in hand"
            value={<span className={mine.balance < -0.004 ? 'text-red-600' : 'text-gray-900'}>{fmtTk(mine.balance)}</span>}
            href={`/landscaping/cash?holder=${mine.holder}`}
            sub={<>
              {mine.given || mine.spent || mine.returned ? flow(mine) : 'No cash given to you yet'}
              {mine.balance < -0.004 ? <ShortNote f={mine} self isAdmin={isAdmin} /> : <span className="text-gray-400"> · tap to see your entries</span>}
            </>} />
        )}

        {(others.length > 0 || isAdmin || !mine) && (
          <LsSection title="Cash with each person" meta={others.length ? 'what each one should have in hand' : undefined} action={giveCash}>
            {others.length === 0 ? (
              <LsEmpty title="No cash handed out yet." hint={isAdmin ? 'Use “Give cash” to record cash handed to an accountant.' : undefined} />
            ) : (
              <ul className="divide-y divide-gray-100">
                {others.map((f) => {
                  const short = f.balance < -0.004
                  const picked = holder?.holder === f.holder
                  return (
                    <li key={f.holder} className={cn(picked && 'bg-forest-50')}>
                      <Link href={`/landscaping/cash?holder=${f.holder}`} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900">{f.name}{picked && <span className="ml-1.5 text-xs font-normal text-forest-700">· showing</span>}</p>
                          <p className="text-xs text-gray-500">{flow(f)}</p>
                          {short && <ShortNote f={f} self={false} isAdmin={isAdmin} />}
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <p className={cn('text-base font-bold tabular-nums', short ? 'text-red-600' : 'text-gray-900')}>{fmtTk(f.balance)}</p>
                          <p className="text-xs text-gray-500">{short ? 'below zero' : 'in hand'}</p>
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </LsSection>
        )}

        {holder && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-forest-200 bg-forest-50 px-4 py-2 text-sm text-forest-900">
            <span className="min-w-0 flex-1">Showing only <b>{holder.name}</b>’s cash entries.</span>
            <LinkButton href="/landscaping/cash">Show everyone</LinkButton>
          </div>
        )}

        <LsSection title="Labour / food / other spending" meta={holder ? `from ${holder.name}’s cash` : undefined}>
          {expenses.length === 0 ? <LsEmpty title="Nothing recorded yet." hint={holder ? 'No spending from this person’s cash.' : canSpend ? 'Use the green button at the top to record daily labour, food or small spending.' : undefined} /> : (
            <ul className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium text-gray-900">{CAT[e.category] ?? e.category}</span>
                      <span className="text-xs text-gray-500">{fmtDay(e.exp_date)}</span>
                    </p>
                    {(e.workers || e.description || e.payee) && (
                      <p className="break-words text-gray-700">{e.workers ? `${e.workers} × ${formatBDT(Number(e.rate))}` : ''}{e.workers && (e.description || e.payee) ? ' · ' : ''}{e.description ?? ''}{e.payee ? `${e.description ? ' · ' : ''}${e.payee}` : ''}</p>
                    )}
                    <p className="text-xs text-gray-500">{e.project_code ?? 'Overhead'} · {e.method === 'cash' ? `cash${e.holder_name ? ` (${e.holder_name})` : ''}` : e.method}</p>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end">
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
                    <p className="text-xs text-gray-500">{fmtDay(m.mov_date)}{m.note ? ` · ${m.note}` : ''}</p>
                  </div>
                  <Money value={m.amount} className={cn('flex-shrink-0 font-semibold', m.kind === 'given' ? 'text-gray-900' : 'text-emerald-700')} />
                </li>
              ))}
            </ul>
          </LsSection>
        )}
    </LsPage>
  )
}
