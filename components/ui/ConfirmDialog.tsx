'use client'

import { useState, useCallback, createContext, useContext, type ReactNode } from 'react'
import { AlertTriangle, HelpCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

/**
 * Replaces raw window.confirm(). The app had 24+ of them for destructive
 * actions — unstyleable, unbrandable, and they look like a 2003 web page.
 *
 * Built on the existing Modal, which already bottom-sheets on mobile.
 *
 * Promise-based so a call site reads almost identically to what it replaced:
 *
 *   const ok = await confirm({ title: 'Delete this?', danger: true })
 *   if (!ok) return
 */

export interface ConfirmOptions {
  title:        string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?:  string
  /** Red confirm button — use for anything destructive. */
  danger?:      boolean
}

type Resolver = (ok: boolean) => void

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const [resolver, setResolver] = useState<{ fn: Resolver } | null>(null)

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o)
    return new Promise<boolean>((resolve) => setResolver({ fn: resolve }))
  }, [])

  function settle(ok: boolean) {
    resolver?.fn(ok)
    setResolver(null)
    setOpts(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => settle(false)}
        title={opts?.title ?? ''}
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${
              opts?.danger ? 'bg-red-100 text-red-600' : 'bg-forest-50 text-forest-700'
            }`}>
              {opts?.danger ? <AlertTriangle size={18} /> : <HelpCircle size={18} />}
            </span>
            {opts?.description && (
              <div className="flex-1 pt-1 text-sm text-gray-700">{opts.description}</div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button variant="outline" size="md" onClick={() => settle(false)}>
              {opts?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              variant={opts?.danger ? 'danger' : 'primary'}
              size="md"
              onClick={() => settle(true)}
            >
              {opts?.confirmLabel ?? 'Confirm'}
            </Button>
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

/**
 * Falls back to window.confirm if the provider isn't mounted, so a component
 * used outside the agent layout still behaves correctly rather than crashing.
 */
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  return useCallback(
    (opts: ConfirmOptions): Promise<boolean> => {
      if (ctx) return ctx(opts)
      const text = [opts.title, typeof opts.description === 'string' ? opts.description : '']
        .filter(Boolean).join('\n\n')
      return Promise.resolve(window.confirm(text))
    },
    [ctx],
  )
}
