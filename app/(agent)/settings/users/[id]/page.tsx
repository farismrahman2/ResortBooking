import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Mail, Phone, Calendar, Clock } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { UserDetailActions } from '@/components/settings/UserDetailActions'
import { getUserById } from '@/lib/queries/users'
import { listRoles } from '@/lib/queries/roles'
import { requirePermission, getCurrentUserContext } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/formatters/dates'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: { id: string }
}

const ROLE_BADGE: Record<string, string> = {
  admin:      'bg-slate-900 text-white border-slate-900',
  manager:    'bg-indigo-50 text-indigo-700 border-indigo-200',
  front_desk: 'bg-violet-50 text-violet-700 border-violet-200',
  accountant: 'bg-rose-50 text-rose-700 border-rose-200',
}

export default async function UserDetailPage({ params }: PageProps) {
  await requirePermission('settings', 'read')
  const [user, roles, ctx] = await Promise.all([
    getUserById(params.id),
    listRoles(),
    getCurrentUserContext(),
  ])
  if (!user) notFound()

  const isSelf = ctx?.user_id === user.user_id

  return (
    <div className="flex h-full flex-col">
      <Topbar title={user.full_name} subtitle={user.email} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6 space-y-5">

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700 font-bold">
              {user.full_name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                  ROLE_BADGE[user.role.slug] ?? 'bg-gray-100 text-gray-700 border-gray-200'
                }`}
              >
                {user.role.display_name}
              </span>
              {!user.is_active && (
                <span className="ml-2 rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                  Deactivated
                </span>
              )}
              {isSelf && (
                <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  you
                </span>
              )}
            </div>
          </div>
          <UserDetailActions user={user} roles={roles} isSelf={isSelf} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Contact">
            <Field icon={<Mail size={12} />} label="Email" value={user.email} mono />
            <Field icon={<Phone size={12} />} label="Phone" value={user.phone ?? '—'} />
          </Card>
          <Card title="Activity">
            <Field icon={<Calendar size={12} />} label="Created" value={formatDate(user.created_at.slice(0, 10))} />
            <Field icon={<Clock size={12} />} label="Last login" value={user.last_login_at ? formatDate(user.last_login_at.slice(0, 10)) : 'Never'} />
          </Card>
        </div>

        <p className="text-xs text-gray-500">
          To edit which permissions this user&apos;s role has, go to{' '}
          <Link href={`/settings/roles/${user.role.slug}`} className="text-slate-700 hover:underline">
            Roles → {user.role.display_name}
          </Link>.
        </p>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5 space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">{title}</h3>
      {children}
    </div>
  )
}

function Field({
  label, value, icon, mono,
}: { label: string; value: string; icon?: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 inline-flex items-center gap-1">
        {icon}{label}
      </p>
      <p className={`text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
