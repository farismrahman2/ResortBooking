import Link from 'next/link'
import { Star, Pencil } from 'lucide-react'
import type { CrmContact } from '@/lib/supabase/types-crm'
import { formatBdPhone } from '@/lib/crm/phone-format'
import { DEPARTMENT_LABELS } from './labels'

interface Props {
  contacts:  CrmContact[]
  accountId: string
  canWrite:  boolean
}

export function ContactsList({ contacts, accountId, canWrite }: Props) {
  if (contacts.length === 0) {
    return <p className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">No contacts yet.</p>
  }
  return (
    <div className="space-y-2">
      {contacts.map((c) => (
        <div key={c.id} className="flex items-start justify-between rounded-lg border border-gray-200 bg-white p-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-gray-900">{c.full_name}</span>
              {c.is_primary && <Star size={13} className="fill-amber-400 text-amber-400" />}
            </div>
            <p className="text-xs text-gray-500">
              {[c.designation, c.department ? DEPARTMENT_LABELS[c.department] : null].filter(Boolean).join(' · ') || '—'}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {[formatBdPhone(c.phone), c.email].filter(Boolean).join(' · ')}
            </p>
          </div>
          {canWrite && (
            <Link href={`/crm/accounts/${accountId}/contacts/${c.id}/edit`} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
              <Pencil size={14} />
            </Link>
          )}
        </div>
      ))}
    </div>
  )
}
