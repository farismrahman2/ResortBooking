import Link from 'next/link'
import { Users, ChevronRight, ShieldCheck } from 'lucide-react'
import type { RoleRow } from '@/lib/supabase/types'

interface Props {
  role:      RoleRow
  headcount: number
  /** Map: module_slug → level (3-letter snippet for the chip strip) */
  permissionSummary: { module: string; level: 'none' | 'read' | 'write' }[]
}

const LEVEL_DOT: Record<string, string> = {
  none:  'bg-gray-200',
  read:  'bg-amber-400',
  write: 'bg-emerald-500',
}

export function RoleCard({ role, headcount, permissionSummary }: Props) {
  return (
    <Link
      href={`/settings/roles/${role.slug}`}
      className="group block rounded-xl border border-gray-200 bg-white p-4 hover:border-slate-400 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
            <ShieldCheck size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{role.display_name}</p>
            {role.description && (
              <p className="text-xs text-gray-500 line-clamp-1">{role.description}</p>
            )}
          </div>
        </div>
        <ChevronRight size={16} className="text-gray-400 group-hover:text-slate-600 mt-2" />
      </div>

      <div className="mt-3 flex items-center gap-1 flex-wrap">
        {permissionSummary.map((p) => (
          <span
            key={p.module}
            className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-700"
            title={`${p.module}: ${p.level}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${LEVEL_DOT[p.level]}`} />
            {p.module}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1 text-xs text-gray-500">
        <Users size={12} />
        <span>{headcount} active user{headcount === 1 ? '' : 's'}</span>
      </div>
    </Link>
  )
}
