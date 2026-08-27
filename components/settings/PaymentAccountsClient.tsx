'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Save, AlertCircle, Landmark } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { safeCall } from '@/lib/actions/safe-call'
import { toast } from '@/lib/toast'
import {
  createPaymentAccount, updatePaymentAccount, togglePaymentAccountActive,
} from '@/lib/actions/payment-accounts'
import type { PaymentAccount } from '@/lib/queries/payment-accounts'

const METHODS: Array<{ value: string; label: string }> = [
  { value: 'cash',          label: 'Cash' },
  { value: 'bkash',         label: 'bKash' },
  { value: 'nagad',         label: 'Nagad' },
  { value: 'rocket',        label: 'Rocket' },
  { value: 'card',          label: 'Card / POS' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other',         label: 'Other' },
]

const blank = { display_name: '', method: 'bank_transfer', account_ref: '', bank_name: '', notes: '' }

/**
 * The resort's own money destinations. Reconciliation happens per ACCOUNT —
 * a statement covers one account, never "all cards" — so each real bank
 * account, wallet and card terminal needs its own row here.
 */
export function PaymentAccountsClient({ accounts }: { accounts: PaymentAccount[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState(blank)
  const [adding, setAdding] = useState(accounts.length === 0)
  const [edits, setEdits] = useState<Record<string, Partial<PaymentAccount>>>({})

  function add() {
    setError(null)
    start(async () => {
      const r = await safeCall(() => createPaymentAccount(draft))
      if (!r.success) { setError(r.error); return }
      toast.success(`${draft.display_name} added`)
      setDraft(blank); setAdding(false); router.refresh()
    })
  }

  function save(a: PaymentAccount) {
    const patch = edits[a.id] ?? {}
    setError(null)
    start(async () => {
      const r = await safeCall(() => updatePaymentAccount(a.id, {
        display_name: (patch.display_name ?? a.display_name) as string,
        method:       (patch.method ?? a.method) as string,
        account_ref:  (patch.account_ref ?? a.account_ref) ?? null,
        bank_name:    (patch.bank_name ?? a.bank_name) ?? null,
        notes:        (patch.notes ?? a.notes) ?? null,
      }))
      if (!r.success) { setError(r.error); return }
      toast.success('Saved')
      setEdits((p) => { const n = { ...p }; delete n[a.id]; return n })
      router.refresh()
    })
  }

  function toggle(id: string) {
    start(async () => {
      const r = await safeCall(() => togglePaymentAccountActive(id))
      if (!r.success) { toast.error(r.error); return }
      router.refresh()
    })
  }

  const patchOf = (a: PaymentAccount) => ({ ...a, ...(edits[a.id] ?? {}) })
  const setPatch = (id: string, p: Partial<PaymentAccount>) =>
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? {}), ...p } }))

  return (
    <div className="space-y-4">
      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" /> {error}
        </p>
      )}

      <p className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        One row per <strong>real</strong> destination: each bank account, each bKash/Nagad wallet,
        each card terminal, and the cash drawer. A bank statement covers one account — so the finer
        this list is, the more exactly the Payment Transactions report matches what the bank sends.
      </p>

      <div className="space-y-2">
        {accounts.map((a) => {
          const v = patchOf(a)
          const dirty = Boolean(edits[a.id])
          return (
            <div key={a.id}
              className={`rounded-xl border bg-white p-3 ${a.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <Input label="Name" value={v.display_name}
                  onChange={(e) => setPatch(a.id, { display_name: e.target.value })} />
                <div>
                  <label className="field-label">Tender</label>
                  <select value={v.method}
                    onChange={(e) => setPatch(a.id, { method: e.target.value })}
                    className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-2 text-sm">
                    {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <Input label="Bank / provider" value={v.bank_name ?? ''}
                  onChange={(e) => setPatch(a.id, { bank_name: e.target.value })}
                  placeholder="e.g. City Bank" />
                <Input label="Account / wallet / terminal no." value={v.account_ref ?? ''}
                  onChange={(e) => setPatch(a.id, { account_ref: e.target.value })}
                  placeholder="e.g. 1234567890" />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => toggle(a.id)} disabled={pending}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    a.is_active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-gray-300 bg-gray-100 text-gray-500'}`}>
                  {a.is_active ? 'Active' : 'Retired'}
                </button>
                {dirty && (
                  <Button type="button" variant="primary" size="sm" className="ml-auto gap-1.5"
                    loading={pending} onClick={() => save(a)}>
                    <Save size={13} /> Save
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {adding ? (
        <div className="space-y-2 rounded-xl border border-forest-300 bg-forest-50/40 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-forest-800">
            <Landmark size={13} /> New account
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <Input label="Name" value={draft.display_name}
              onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
              placeholder="e.g. City Bank current" />
            <div>
              <label className="field-label">Tender</label>
              <select value={draft.method}
                onChange={(e) => setDraft({ ...draft, method: e.target.value })}
                className="min-h-[42px] w-full rounded-lg border border-gray-300 bg-white px-2 text-sm">
                {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <Input label="Bank / provider" value={draft.bank_name}
              onChange={(e) => setDraft({ ...draft, bank_name: e.target.value })} />
            <Input label="Account / wallet / terminal no." value={draft.account_ref}
              onChange={(e) => setDraft({ ...draft, account_ref: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="md" className="flex-1"
              onClick={() => { setAdding(false); setDraft(blank) }}>Cancel</Button>
            <Button type="button" variant="primary" size="md" className="flex-1"
              loading={pending} onClick={add}>Add account</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="md" className="w-full gap-1.5"
          onClick={() => setAdding(true)}>
          <Plus size={14} /> Add an account, wallet or terminal
        </Button>
      )}
    </div>
  )
}
