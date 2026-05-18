'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, CheckCircle2, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { newUserSchema, type NewUserInput } from '@/lib/validators/users'
import { createUser } from '@/lib/actions/users'
import type { RoleRow } from '@/lib/supabase/types'

interface Props {
  roles: RoleRow[]
}

function generatePassword(): string {
  const charset = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  // 12 chars random — easy to retype, hard to brute force
  if (typeof crypto !== 'undefined') {
    const arr = new Uint32Array(12)
    crypto.getRandomValues(arr)
    for (let i = 0; i < 12; i++) out += charset[arr[i] % charset.length]
  } else {
    for (let i = 0; i < 12; i++) out += charset[Math.floor(Math.random() * charset.length)]
  }
  return out
}

export function UserForm({ roles }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [tempEmail, setTempEmail]       = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const {
    register, handleSubmit, control, setValue, watch,
    formState: { errors },
  } = useForm<NewUserInput>({
    resolver: zodResolver(newUserSchema),
    defaultValues: {
      full_name: '',
      email:     '',
      phone:     '',
      role_id:   roles.find((r) => r.slug === 'front_desk')?.id ?? roles[0]?.id ?? '',
      password:  '',
    },
  })

  const currentPassword = watch('password')

  function onSubmit(values: NewUserInput) {
    setError(null)
    startTransition(async () => {
      const r = await createUser(values)
      if (!r.success) { setError(r.error); return }
      setTempPassword(r.data.temp_password)
      setTempEmail(values.email)
    })
  }

  async function copyPassword() {
    if (!tempPassword) return
    await navigator.clipboard.writeText(tempPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (tempPassword && tempEmail) {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-emerald-900">User created.</h3>
            <p className="mt-1 text-xs text-emerald-800">
              Share these credentials with the new user. <strong>This is the only time the password
              will be shown</strong>. Tell them to change it on first login.
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-emerald-200 bg-white p-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Email</p>
            <p className="font-mono text-sm text-gray-900">{tempEmail}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500">Temporary password</p>
            <div className="flex items-center gap-2">
              <p className="font-mono text-base font-bold text-gray-900 tabular-nums">{tempPassword}</p>
              <button
                type="button"
                onClick={copyPassword}
                className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center gap-1"
              >
                <Copy size={12} />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="md" onClick={() => router.push('/settings/users')}>
            Back to users
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => {
              setTempPassword(null)
              setTempEmail(null)
              setValue('full_name', '')
              setValue('email', '')
              setValue('phone', '')
              setValue('password', '')
            }}
          >
            Add another user
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        label="Full Name"
        required
        placeholder="Jane Doe"
        error={errors.full_name?.message}
        {...register('full_name')}
      />
      <Input
        label="Email"
        type="email"
        required
        placeholder="jane@example.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Phone"
        placeholder="01XXXXXXXXX (optional)"
        {...register('phone')}
      />

      <Controller
        name="role_id"
        control={control}
        render={({ field }) => (
          <Select
            label="Role"
            required
            value={field.value}
            onChange={(e) => field.onChange(e.target.value)}
            error={errors.role_id?.message}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.display_name}</option>
            ))}
          </Select>
        )}
      />

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input
              label="Initial Password"
              required
              placeholder="At least 8 characters"
              error={errors.password?.message}
              {...register('password')}
              hint="The user will see this once. They should change it on first login."
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="md"
            onClick={() => setValue('password', generatePassword(), { shouldValidate: true })}
          >
            Generate
          </Button>
        </div>
        {currentPassword && currentPassword.length >= 8 && (
          <p className="text-xs text-slate-500">
            Length: <span className="font-mono">{currentPassword.length}</span>
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span className="whitespace-pre-wrap">{error}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-4">
        <Button type="button" variant="outline" size="md" disabled={pending} onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="md" loading={pending}>
          Create User
        </Button>
      </div>
    </form>
  )
}
