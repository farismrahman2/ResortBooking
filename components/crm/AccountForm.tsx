'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { createAccount, updateAccount } from '@/lib/actions/crm'
import type { AccountFormInput } from '@/lib/validators/crm'
import type { CrmSector, CrmTier, CrmAccount, AccountStatus } from '@/lib/supabase/types-crm'
import { STATUS_LABELS } from './labels'

interface OwnerOption { id: string; name: string }

interface Props {
  sectors:      CrmSector[]
  tiers:        CrmTier[]
  owners:       OwnerOption[]
  parentChoices: { id: string; company_name: string }[]
  defaultOwnerId?: string
  fixedParentId?:  string   // pre-filled when creating a branch
  account?:     CrmAccount
}

export function AccountForm({ sectors, tiers, owners, parentChoices, defaultOwnerId, fixedParentId, account }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    company_name:      account?.company_name ?? '',
    owner_user_id:     account?.owner_user_id ?? defaultOwnerId ?? owners[0]?.id ?? '',
    sector_id:         account?.sector_id ?? '',
    tier_id:           account?.tier_id ?? '',
    status:            (account?.status ?? 'target') as AccountStatus,
    parent_account_id: account?.parent_account_id ?? fixedParentId ?? '',
    hq_location:       account?.hq_location ?? '',
    branch_presence:   account?.branch_presence ?? '',
    approx_employees:  account?.approx_employees != null ? String(account.approx_employees) : '',
    next_action:       account?.next_action ?? '',
    notes:             account?.notes ?? '',
  })

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })) }

  function submit() {
    setError(null)
    const payload: AccountFormInput = {
      company_name:      form.company_name.trim(),
      owner_user_id:     form.owner_user_id,
      sector_id:         form.sector_id || null,
      tier_id:           form.tier_id || null,
      status:            form.status,
      parent_account_id: form.parent_account_id || null,
      hq_location:       form.hq_location.trim() || null,
      branch_presence:   form.branch_presence.trim() || null,
      approx_employees:  form.approx_employees === '' ? null : Number(form.approx_employees),
      next_action:       form.next_action.trim() || null,
      notes:             form.notes.trim() || null,
    }
    startTransition(async () => {
      const res = account ? await updateAccount(account.id, payload) : await createAccount(payload)
      if (!res.success) { setError(res.error); return }
      router.push(account ? `/crm/accounts/${account.id}` : '/crm/accounts')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Input label="Company name" required value={form.company_name} onChange={(e) => set('company_name', e.target.value)} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Owner" required value={form.owner_user_id} onChange={(e) => set('owner_user_id', e.target.value)}
          options={owners.map((o) => ({ value: o.id, label: o.name }))} />
        <Select label="Status" value={form.status} onChange={(e) => set('status', e.target.value as AccountStatus)}
          options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: v }))} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Select label="Sector" value={form.sector_id} onChange={(e) => set('sector_id', e.target.value)}>
          <option value="">—</option>
          {sectors.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
        </Select>
        <Select label="Tier" value={form.tier_id} onChange={(e) => set('tier_id', e.target.value)}>
          <option value="">—</option>
          {tiers.map((t) => <option key={t.id} value={t.id}>{t.display_name} ({t.default_discount_pct}%)</option>)}
        </Select>
      </div>

      <Select label="Parent account (for a branch)" value={form.parent_account_id}
        onChange={(e) => set('parent_account_id', e.target.value)} disabled={!!fixedParentId}>
        <option value="">— None (this is a top-level company) —</option>
        {parentChoices.filter((p) => p.id !== account?.id).map((p) => <option key={p.id} value={p.id}>{p.company_name}</option>)}
      </Select>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="HQ location" value={form.hq_location} onChange={(e) => set('hq_location', e.target.value)} />
        <Input label="Approx. employees" type="number" min="0" value={form.approx_employees} onChange={(e) => set('approx_employees', e.target.value)} />
      </div>

      <Input label="Branch presence" value={form.branch_presence} onChange={(e) => set('branch_presence', e.target.value)}
        hint="Free text, e.g. 'HQ + 187 branches nationwide'" />
      <Input label="Next action" value={form.next_action} onChange={(e) => set('next_action', e.target.value)} />
      <Textarea label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />

      <div className="flex gap-2 pt-1">
        <Button onClick={submit} loading={pending} disabled={!form.company_name.trim() || !form.owner_user_id}>
          {account ? 'Save changes' : 'Create account'}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>Cancel</Button>
      </div>
    </div>
  )
}
