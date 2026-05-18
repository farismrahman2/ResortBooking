'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { updateRolePermissions } from '@/lib/actions/roles'
import type {
  ModuleRow,
  RoleRow,
  PermissionLevel,
  RoleWithPermissions,
} from '@/lib/supabase/types'

interface Props {
  role:    RoleRow
  modules: ModuleRow[]
  /** Current permission map keyed by module_id */
  initial: RoleWithPermissions['permissions']
}

const LEVELS: PermissionLevel[] = ['none', 'read', 'write']

const LEVEL_LABELS: Record<PermissionLevel, string> = {
  none:  'None',
  read:  'Read',
  write: 'Write',
}

export function PermissionGrid({ role, modules, initial }: Props) {
  const router  = useRouter()
  const [pending, startTransition] = useTransition()
  const [error,   setError]   = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Build initial map: module_id → level
  const initialMap = useMemo(() => {
    const m: Record<string, PermissionLevel> = {}
    for (const mod of modules) m[mod.id] = 'none'
    for (const p of initial) m[p.module_id] = p.level
    return m
  }, [initial, modules])

  const [draft, setDraft] = useState<Record<string, PermissionLevel>>(initialMap)

  const dirtyModules = useMemo(
    () => modules.filter((m) => draft[m.id] !== initialMap[m.id]),
    [modules, draft, initialMap],
  )

  function setLevel(moduleId: string, level: PermissionLevel) {
    setDraft((p) => ({ ...p, [moduleId]: level }))
  }

  function isLockedAdminSettings(mod: ModuleRow): boolean {
    return role.slug === 'admin' && mod.slug === 'settings'
  }

  function save() {
    setError(null); setSavedAt(null)
    startTransition(async () => {
      const r = await updateRolePermissions(role.id, { permissions: draft })
      if (!r.success) { setError(r.error); return }
      setSavedAt(new Date().toLocaleTimeString())
      setConfirmOpen(false)
      router.refresh()
    })
  }

  const hasChanges = dirtyModules.length > 0

  return (
    <div className="space-y-4">
      {role.slug === 'admin' && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
          <span>
            Admin must retain <strong>write</strong> access to Settings — that option is locked
            so an admin can never lock all admins out.
          </span>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2.5 font-medium">Module</th>
                <th className="px-4 py-2.5 font-medium text-center">None</th>
                <th className="px-4 py-2.5 font-medium text-center">Read</th>
                <th className="px-4 py-2.5 font-medium text-center">Write</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {modules.map((m) => {
                const current  = draft[m.id] ?? 'none'
                const original = initialMap[m.id] ?? 'none'
                const isDirty  = current !== original
                const isLocked = isLockedAdminSettings(m)
                return (
                  <tr key={m.id} className={isDirty ? 'bg-amber-50/40' : ''}>
                    <td className="px-4 py-2.5 align-top">
                      <p className="font-medium text-gray-900">{m.display_name}</p>
                      {m.description && <p className="text-xs text-gray-500">{m.description}</p>}
                    </td>
                    {LEVELS.map((lvl) => {
                      const checked  = current === lvl
                      const disabled = isLocked && lvl !== 'write'
                      return (
                        <td key={lvl} className="px-4 py-2.5 align-top text-center">
                          <label
                            className={`inline-flex items-center justify-center cursor-pointer ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                            title={disabled ? 'Admin must keep write access to Settings' : LEVEL_LABELS[lvl]}
                          >
                            <input
                              type="radio"
                              name={`mod-${m.id}`}
                              value={lvl}
                              checked={checked}
                              disabled={disabled}
                              onChange={() => setLevel(m.id, lvl)}
                              className="h-4 w-4 text-slate-700 border-gray-300 focus:ring-slate-400"
                            />
                          </label>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {savedAt && !error && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          <CheckCircle2 size={14} className="mt-0.5 flex-shrink-0" />
          <span>Saved at {savedAt}.</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-500">
          {hasChanges
            ? `${dirtyModules.length} unsaved change${dirtyModules.length === 1 ? '' : 's'}`
            : 'No changes'}
        </p>
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={!hasChanges || pending}
          onClick={() => setConfirmOpen(true)}
        >
          Save Changes
        </Button>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Permission Changes">
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Saving will change <strong>{dirtyModules.length}</strong> module
            {dirtyModules.length === 1 ? '' : 's'} for the <strong>{role.display_name}</strong> role.
            This affects every active user in this role.
          </p>
          <ul className="space-y-1 text-xs text-gray-600">
            {dirtyModules.map((m) => (
              <li key={m.id} className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
                <span className="font-semibold text-gray-900">{m.display_name}:</span>{' '}
                <span className="text-gray-500">{LEVEL_LABELS[initialMap[m.id]]}</span>
                {' → '}
                <span className="font-semibold text-slate-700">{LEVEL_LABELS[draft[m.id]]}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="md" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="md" loading={pending} onClick={save}>
              Confirm Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
