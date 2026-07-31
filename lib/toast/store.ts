/**
 * Tiny zero-dependency toast store.
 *
 * Deliberately a module-level pub/sub rather than React context: toasts are
 * fired from ~69 action call sites buried deep in component trees, and
 * threading a hook through all of them would be far more invasive than the
 * feature is worth. `import { toast } from '@/lib/toast'` works anywhere.
 */

export type ToastKind = 'success' | 'error' | 'info'

export interface ToastAction {
  label:   string
  onClick: () => void | Promise<void>
}

export interface Toast {
  id:          number
  kind:        ToastKind
  message:     string
  description?: string
  /** Optional single action — used for undo-instead-of-confirm flows. */
  action?:     ToastAction
  duration:    number
}

type Listener = (toasts: Toast[]) => void

let toasts: Toast[] = []
let listeners: Listener[] = []
let nextId = 1

/** Errors linger — the user may need to read and act on them. */
const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 4000,
  info:    4000,
  error:   7000,
}

/** Cap the stack so a loop of failures can't bury the screen. */
const MAX_VISIBLE = 3

function emit() {
  for (const l of listeners) l(toasts)
}

export function subscribe(listener: Listener): () => void {
  listeners.push(listener)
  listener(toasts)
  return () => { listeners = listeners.filter((l) => l !== listener) }
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function push(
  kind: ToastKind,
  message: string,
  opts?: { description?: string; action?: ToastAction; duration?: number },
): number {
  const id = nextId++
  const duration = opts?.duration ?? DEFAULT_DURATION[kind]
  const t: Toast = {
    id, kind, message,
    description: opts?.description,
    action:      opts?.action,
    duration,
  }
  toasts = [...toasts, t].slice(-MAX_VISIBLE)
  emit()
  if (duration > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), duration)
  }
  return id
}

type ToastOpts = { description?: string; action?: ToastAction; duration?: number }

export const toast = {
  success: (message: string, opts?: ToastOpts) => push('success', message, opts),
  error:   (message: string, opts?: ToastOpts) => push('error',   message, opts),
  info:    (message: string, opts?: ToastOpts) => push('info',    message, opts),
  dismiss: dismissToast,
  /**
   * Convenience for the repo's ActionResult shape — the single most common
   * call pattern. Returns the result so callers can keep branching on it.
   *
   *   const r = await toast.fromResult(await saveThing(id), 'Saved')
   *   if (!r.success) return
   */
  fromResult<T extends { success: boolean; error?: string }>(
    result: T,
    successMessage: string,
    opts?: ToastOpts,
  ): T {
    if (result.success) toast.success(successMessage, opts)
    else toast.error(result.error || 'Something went wrong')
    return result
  },
}
