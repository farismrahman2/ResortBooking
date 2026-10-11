import { describe, expect, it } from 'vitest'
import { withDeadline } from './deadline'

describe('withDeadline', () => {
  it('passes a fast answer through', async () => {
    await expect(withDeadline(Promise.resolve(7), 50)).resolves.toBe(7)
  })
  it('gives up on one that never answers (a retry loop that runs on)', async () => {
    const never = new Promise<number>(() => {})
    const t0 = Date.now()
    await expect(withDeadline(never, 60, 'session check')).rejects.toThrow(/session check timed out/)
    expect(Date.now() - t0).toBeLessThan(500)
  })
})

import { isTransientFailure, DeadlineError } from './deadline'

describe('isTransientFailure', () => {
  it('outages are transient; signed-out and bad requests are not', () => {
    expect(isTransientFailure(new DeadlineError('session check', 10))).toBe(true)
    expect(isTransientFailure({ name: 'AuthRetryableFetchError', message: 'The operation was aborted due to timeout', status: 0 })).toBe(true)
    expect(isTransientFailure({ message: 'TypeError: fetch failed' })).toBe(true)
    expect(isTransientFailure({ status: 522 })).toBe(true)
    expect(isTransientFailure({ name: 'AuthSessionMissingError', message: 'Auth session missing!', status: 400 })).toBe(false)
    expect(isTransientFailure({ message: 'Invalid Refresh Token: Refresh Token Not Found', status: 400 })).toBe(false)
    expect(isTransientFailure(null)).toBe(false)
  })
})
