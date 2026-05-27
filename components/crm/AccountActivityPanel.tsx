'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ActivityForm } from './ActivityForm'
import { ActivitiesFeed } from './ActivitiesFeed'
import type { CrmContact, CrmOpportunity, CrmActivityWithRelations } from '@/lib/supabase/types-crm'

interface Props {
  accountId:     string
  contacts:      CrmContact[]
  opportunities: Pick<CrmOpportunity, 'id' | 'opportunity_name'>[]
  activities:    CrmActivityWithRelations[]
  canWrite:      boolean
}

export function AccountActivityPanel({ accountId, contacts, opportunities, activities, canWrite }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-3">
      {canWrite && (
        open ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <ActivityForm accountId={accountId} contacts={contacts} opportunities={opportunities} onDone={() => setOpen(false)} />
            <button onClick={() => setOpen(false)} className="mt-2 text-xs text-gray-500 hover:underline">Cancel</button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus size={14} className="mr-1" /> Log activity</Button>
        )
      )}
      <ActivitiesFeed activities={activities} showAccount={false} />
    </div>
  )
}
