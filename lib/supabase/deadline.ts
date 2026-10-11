/**
 * Give up on a promise after `ms`, whatever it is doing inside.
 *
 * Why a race and not just a fetch timeout: supabase-js retries a failed
 * session refresh (AuthRetryableFetchError) with back-off for up to ~30s.
 * A per-request abort only ends each attempt — the retries still added up
 * past Vercel's 25s limit and the whole site answered 504
 * MIDDLEWARE_INVOCATION_TIMEOUT. This caps the total.
 */
export class DeadlineError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

export function withDeadline<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError(label, ms)), ms)
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

/** fetch that gives up rather than hanging forever. */
export function boundedFetch(timeoutMs: number): typeof fetch {
  return (input, init) => {
    const timeout = AbortSignal.timeout(timeoutMs)
    const signal = init?.signal
      ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, timeout]) : init.signal)
      : timeout
    return fetch(input, { ...init, signal })
  }
}

/** A failure that means "Supabase didn't answer", not "you are signed out"
 *  or "no such row": timeouts, aborted fetches, gateway errors. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isTransientFailure(error: any): boolean {
  if (!error) return false
  if (error instanceof DeadlineError) return true
  const status = Number(error.status ?? error.code ?? NaN)
  if (status === 0 || status === 502 || status === 503 || status === 504 || status === 520 || status === 522 || status === 524) return true
  const text = `${error.name ?? ''} ${error.message ?? ''} ${error.details ?? ''}`
  return /abort|timeout|timed out|fetch failed|network|retryable|ECONN|socket|upstream/i.test(text)
}
