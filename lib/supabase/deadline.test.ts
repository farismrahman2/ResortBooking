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
