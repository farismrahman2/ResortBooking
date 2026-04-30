'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { AlertCircle } from 'lucide-react'
import {
  changeRole,
  resetPassword,
  deactivateUser,
  reactivateUser,
  updateUser,
} from '@/lib/actions/users'
import type { RoleRow, UserProfileWithRole } from '@/lib/supabase/types'

interface Props {
  user:      UserProfileWithRole
  roles:     RoleRow[]
  isSelf:    boolean
}

export function UserDetailActions({ user, roles, isSelf }: Props) {
  const router  = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,   setError]        = useState<string | null>(null)

  // Modal states
  const [editOpen,    setEditOpen]   = useState(false)
  const [roleOpen,    setRoleOpen]   = useState(false)
  const [pwOpen,      setPwOpen]     = useState(false)
  const [deactOpen,   setDeactOpen]  = useState(false)

  // Edit form state
  const [name,  setName]  = useState(user.full_name)
  const [phone, setPhone] = useState(user.phone ?? '')

  // Change role state
  const [roleId, setRoleId] = useState(user.role_id)

  // Reset password state
  const [newPw, setNewPw] = useState('')
  const [pwShown, setPwShown] = useState<string | null>(null)

  function close() {
    setError(null)
    setEditOpen(false); setRoleOpen(false); setPwOpen(false); setDeactOpen(false)
  }

  function handleSaveProfile() {
    setError(null)
    startTransition(async () => {
      const r = await updateUser(user.user_id, { full_name: name, phone })
      if (!r.success) { setError(r.error); return }
      close()
      router.refresh()
    })
  }

  function handleChangeRole() {
    setError(null)
    startTransition(async () => {
      const r = await changeRole(user.user_id, { role_id: roleId })
      if (!r.success) { setError(r.error); return }
      close()
      router.refresh()
    })
  }

  function handleReset() {
    setError(null)
    setPwShown(null)
    if (newPw.length < 8) { setError('Password must be at least 8 characters'); return }
    startTransition(async () => {
      const r = await resetPassword(user.user_id, { password: newPw })
      if (!r.success) { setError(r.error); return }
      setPwShown(newPw)
      // Don't auto-close — show the password once
    })
  }

  function handleDeactivate() {
    setError(null)
    startTransition(async () => {
      const r = user.is_active
        ? await deactivateUser(user.user_id)
        : await reactivateUser(user.user_id)
      if (!r.success) { setError(r.error); return }
      close()
      router.refresh()
    })
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => { setName(user.full_name); setPhone(user.phone ?? ''); setEditOpen(true) }}>
          Edit Profile
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setRoleId(user.role_id); setRoleOpen(true) }}>
          Change Role
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setNewPw(''); setPwShown(null); setPwOpen(true) }}>
          Reset Password
        </Button>
        {user.is_active ? (
          <Button
            variant="danger"
            size="sm"
            disabled={isSelf}
            title={isSelf ? "You can't deactivate your own account" : ''}
            onClick={() => setDeactOpen(true)}
          >
            Deactivate
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={() => setDeactOpen(true)}>
            Reactivate
          </Button>
        )}
      </div>

      {/* Edit profile */}
      <Modal open={editOpen} onClose={close} title="Edit Profile">
        <div className="space-y-3">
          <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="optional" />
          {error && <ErrorBox text={error} />}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="md" onClick={close}>Cancel</Button>
            <Button variant="primary" size="md" loading={pending} onClick={handleSaveProfile}>Save</Button>
          </div>
        </div>
      </Modal>

      {/* Change role */}
      <Modal open={roleOpen} onClose={close} title="Change Role">
        <div className="space-y-3">
          <Select
            label="Role"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.display_name}</option>
            ))}
          </Select>
          <p className="text-xs text-gray-500">
            Changing the role takes effect on the user&apos;s next page load. Their permissions are
            re-resolved per request.
          </p>
          {error && <ErrorBox text={error} />}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="md" onClick={close}>Cancel</Button>
            <Button variant="primary" size="md" loading={pending} onClick={handleChangeRole} disabled={roleId === user.role_id}>
              Confirm
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reset password */}
      <Modal open={pwOpen} onClose={close} title="Reset Password">
        <div className="space-y-3">
          {pwShown ? (
            <>
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 space-y-1">
                <p className="text-xs font-semibold text-emerald-800">Password reset.</p>
                <p className="text-xs text-emerald-700">Share this with the user. It will not be shown again.</p>
                <p className="mt-1 font-mono text-base font-bold text-emerald-900">{pwShown}</p>
              </div>
              <div className="flex justify-end pt-2">
                <Button variant="outline" size="md" onClick={close}>Close</Button>
              </div>
            </>
          ) : (
            <>
              <Input
                label="New password"
                type="text"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="At least 8 characters"
                hint="The user will see this once. Tell them to change it on first login."
              />
              {error && <ErrorBox text={error} />}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="md" onClick={close}>Cancel</Button>
                <Button variant="primary" size="md" loading={pending} onClick={handleReset}>
                  Reset
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Deactivate / reactivate confirm */}
      <Modal open={deactOpen} onClose={close} title={user.is_active ? 'Deactivate User' : 'Reactivate User'}>
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            {user.is_active
              ? <>Deactivating <strong>{user.full_name}</strong> will sign them out on their next request and prevent further logins. The account is preserved (you can reactivate later).</>
              : <>Reactivating <strong>{user.full_name}</strong> will allow them to log in again with their existing password.</>}
          </p>
          {error && <ErrorBox text={error} />}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="md" onClick={close}>Cancel</Button>
            <Button
              variant={user.is_active ? 'danger' : 'primary'}
              size="md"
              loading={pending}
              onClick={handleDeactivate}
            >
              {user.is_active ? 'Confirm Deactivate' : 'Confirm Reactivate'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
      <span className="whitespace-pre-wrap">{text}</span>
    </div>
  )
}
