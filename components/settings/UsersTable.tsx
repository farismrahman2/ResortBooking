import Link from 'next/link'
import type { UserProfileWithRole } from '@/lib/supabase/types'

interface Props {
  rows: UserProfileWithRole[]
  currentUserId: string | null
}

const ROLE_BADGE: Record<string, string> = {
  admin:      'bg-slate-900 text-white border-slate-900',
  manager:    'bg-indigo-50 text-indigo-700 border-indigo-200',
  front_desk: 'bg-violet-50 text-violet-700 border-violet-200',
  accountant: 'bg-rose-50 text-rose-700 border-rose-200',
  reservation: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export function UsersTable({ rows, currentUserId }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
        <p className="text-sm font-medium text-gray-700">No users yet.</p>
        <p className="mt-1 text-xs text-gray-500">Click &quot;Add User&quot; to create one.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((u) => (
              <tr key={u.user_id} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-2.5 align-top">
                  <Link href={`/settings/users/${u.user_id}`} className="font-medium text-gray-900 hover:text-slate-700">
                    {u.full_name}
                  </Link>
                  {u.user_id === currentUserId && (
                    <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                      you
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 align-top font-mono text-xs text-gray-600">{u.email}</td>
                <td className="px-4 py-2.5 align-top">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      ROLE_BADGE[u.role.slug] ?? 'bg-gray-100 text-gray-700 border-gray-200'
                    }`}
                  >
                    {u.role.display_name}
                  </span>
                </td>
                <td className="px-4 py-2.5 align-top text-xs text-gray-600">{u.phone ?? '—'}</td>
                <td className="px-4 py-2.5 align-top">
                  {u.is_active ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                      Deactivated
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
