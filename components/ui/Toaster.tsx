'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { subscribe, dismissToast, type Toast } from '@/lib/toast'

/**
 * Renders the toast stack. Mounted once in LayoutShell.
 *
 * Placement: top on mobile, bottom-right on desktop. Six heavy forms in this
 * app (QuoteForm, FieldVisitWizard, MenuDayEditor, CoffeeShopSaleForm,
 * PayrollPreviewTable, MonthlyExcelGrid) have sticky bottom action bars, so a
 * bottom-anchored toast on a phone would sit on top of the Save button.
 */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([])
  useEffect(() => subscribe(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <>
      <style>{`
        @keyframes toastInTop    { from { opacity:0; transform: translateY(-12px) } to { opacity:1; transform:none } }
        @keyframes toastInBottom { from { opacity:0; transform: translateY(12px) }  to { opacity:1; transform:none } }
        .toast-item { animation: toastInTop 180ms ease-out }
        @media (min-width: 640px) { .toast-item { animation: toastInBottom 180ms ease-out } }
        @media (prefers-reduced-motion: reduce) { .toast-item { animation: none } }
      `}</style>
      <div
        role="region"
        aria-label="Notifications"
        className={cn(
          'pointer-events-none fixed z-[100] flex flex-col gap-2',
          // mobile: pinned top, clear of the notch
          'inset-x-0 top-0 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]',
          // desktop: bottom-right, above sticky bars
          'sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-auto sm:w-[380px] sm:p-4',
        )}
      >
        {toasts.map((t) => <ToastRow key={t.id} t={t} />)}
      </div>
    </>
  )
}

function ToastRow({ t }: { t: Toast }) {
  const [busy, setBusy] = useState(false)

  const tone = {
    success: { ring: 'ring-green-200', bg: 'bg-white', icon: <CheckCircle2 size={18} className="text-green-600" /> },
    error:   { ring: 'ring-red-200',   bg: 'bg-white', icon: <AlertCircle  size={18} className="text-red-600" /> },
    info:    { ring: 'ring-gray-200',  bg: 'bg-white', icon: <Info         size={18} className="text-forest-700" /> },
  }[t.kind]

  async function runAction() {
    if (!t.action || busy) return
    setBusy(true)
    try { await t.action.onClick() } finally { dismissToast(t.id) }
  }

  return (
    <div
      role={t.kind === 'error' ? 'alert' : 'status'}
      aria-live={t.kind === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'toast-item pointer-events-auto flex items-start gap-2.5 rounded-xl px-3 py-2.5 shadow-lg ring-1',
        tone.bg, tone.ring,
      )}
    >
      <span className="mt-0.5 flex-shrink-0">{tone.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900">{t.message}</p>
        {t.description && <p className="mt-0.5 text-xs text-gray-500">{t.description}</p>}
      </div>
      {t.action && (
        <button
          type="button"
          onClick={runAction}
          disabled={busy}
          className="flex-shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-forest-700 hover:bg-forest-50 disabled:opacity-50"
        >
          {busy ? '…' : t.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => dismissToast(t.id)}
        aria-label="Dismiss"
        className="-mr-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <X size={14} />
      </button>
    </div>
  )
}
