/**
 * Call a server action without the possibility of a hung button.
 *
 * Every action in this codebase catches its own errors and returns
 * `{ success: false, error }` — but that only covers failures that happen
 * *inside* the action. If the request never completes, the promise rejects
 * instead, and the standard call shape
 *
 *     start(async () => { const r = await someAction(); ... })
 *
 * swallows it: React's `isPending` never flips back, so the button sits on
 * "Approving…" forever with nothing on screen explaining why. The approval
 * that was never applied looks, to the person holding the phone, exactly like
 * one that is still going through.
 *
 * Two things cause that in practice:
 *
 *  - A dropped mobile connection. Half this module is used standing in a
 *    kitchen on 4G.
 *  - A deployment landing while the tab stayed open. Next.js derives server
 *    action IDs per build, so a page loaded from the previous build posts an
 *    ID the new one has never heard of and the request 404s.
 *
 * Both surface as a fetch failure with no useful message, so both get told to
 * reload — which is the actual remedy for the second and harmless for the first.
 */

import type { ActionResult, ActionData } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyResult = ActionResult | ActionData<any>

/** Matches the browser's various phrasings of "the request didn't complete". */
const NETWORK = /failed to fetch|networkerror|load failed|connection closed|fetch failed|network request failed/i

export async function safeCall<T extends AnyResult>(
  run: () => Promise<T>,
): Promise<T | { success: false; error: string }> {
  try {
    return await run()
  } catch (err) {
    // A redirect or notFound thrown inside an action is control flow, not an
    // error — hand it back to Next rather than reporting it as a failure.
    if (err && typeof err === 'object' && 'digest' in err
      && typeof (err as { digest?: unknown }).digest === 'string'
      && /^NEXT_/.test((err as { digest: string }).digest)) {
      throw err
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[safeCall] server action failed:', err)
    return {
      success: false,
      error: NETWORK.test(msg)
        ? 'Lost the connection to the server. Check your signal, reload the page, and try again — nothing was saved.'
        : `${msg || 'Something went wrong'} — reload the page and try again.`,
    }
  }
}
