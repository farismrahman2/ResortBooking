'use client'

import { Controller, type Control, type UseFormSetValue } from 'react-hook-form'
import type { CreateQuoteInput } from '@/lib/validators/quote'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Building2, X } from 'lucide-react'

export interface CorporateAccountOption {
  id:            string
  company_name:  string
  account_code:  string
}

interface Props {
  control:  Control<CreateQuoteInput>
  setValue: UseFormSetValue<CreateQuoteInput>
  watched: {
    is_corporate:         boolean | undefined
    company_name:         string  | null | undefined
    corporate_account_id: string  | null | undefined
  }
  /** CRM accounts dropdown options. Empty array hides the picker but keeps the
   *  free-text input — works fine without the CRM module installed. */
  accounts:    CorporateAccountOption[]
  errorMessage?: string
}

export function CorporateBookingFields({ control, setValue, watched, accounts, errorMessage }: Props) {
  const isCorporate    = watched.is_corporate === true
  const linkedAccount  = watched.corporate_account_id
  const linkedAccountName =
    accounts.find((a) => a.id === linkedAccount)?.company_name ?? null

  function handleAccountPick(id: string) {
    if (!id) {
      setValue('corporate_account_id', null, { shouldValidate: true, shouldDirty: true })
      return
    }
    const acc = accounts.find((a) => a.id === id)
    if (!acc) return
    setValue('corporate_account_id', acc.id,           { shouldValidate: true, shouldDirty: true })
    setValue('company_name',         acc.company_name, { shouldValidate: true, shouldDirty: true })
  }

  function handleUnlink() {
    setValue('corporate_account_id', null, { shouldValidate: true, shouldDirty: true })
  }

  function handleToggle(checked: boolean) {
    setValue('is_corporate', checked, { shouldValidate: true, shouldDirty: true })
    if (!checked) {
      setValue('company_name', null, { shouldValidate: true, shouldDirty: true })
      setValue('corporate_account_id', null, { shouldValidate: true, shouldDirty: true })
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/40 p-3 space-y-3">
      <Controller
        name="is_corporate"
        control={control}
        render={({ field }) => (
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-800">
            <input
              type="checkbox"
              checked={field.value ?? false}
              onChange={(e) => {
                field.onChange(e.target.checked)
                handleToggle(e.target.checked)
              }}
              className="h-4 w-4 rounded border-gray-300 text-forest-600 focus:ring-forest-500"
            />
            <Building2 size={14} className="text-gray-500" /> Corporate booking
          </label>
        )}
      />

      {isCorporate && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Controller
            name="company_name"
            control={control}
            render={({ field }) => (
              <div>
                <Input
                  label="Company name"
                  required
                  placeholder="e.g. Square Pharmaceuticals Ltd."
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value)}
                  disabled={!!linkedAccount}
                  error={errorMessage}
                />
                {linkedAccount && (
                  <button
                    type="button"
                    onClick={handleUnlink}
                    className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-700"
                  >
                    <X size={11} /> Unlink CRM account to edit name
                  </button>
                )}
              </div>
            )}
          />

          {accounts.length > 0 && (
            <Controller
              name="corporate_account_id"
              control={control}
              render={({ field }) => (
                <Select
                  label="Link to CRM account (optional)"
                  value={field.value ?? ''}
                  onChange={(e) => handleAccountPick(e.target.value)}
                  hint={linkedAccountName
                    ? `Linked to ${linkedAccountName}`
                    : 'Pick an existing account to auto-fill the company name and tie this quote to CRM analytics.'}
                >
                  <option value="">— No CRM link —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.company_name} ({a.account_code})
                    </option>
                  ))}
                </Select>
              )}
            />
          )}
        </div>
      )}
    </div>
  )
}
