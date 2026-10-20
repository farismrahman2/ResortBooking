import { describe, expect, it } from 'vitest'
import { versionedPdfName } from './filename'

describe('versionedPdfName', () => {
  it('stamps the Dhaka time of the last change', () => {
    expect(versionedPdfName('GCR-booking', 'GCR-B-2026-1304', '2026-10-19T17:02:31Z')).toBe('GCR-booking-GCR-B-2026-1304-v19Oct-2302.pdf')
  })
  it('differs after an edit', () => {
    expect(versionedPdfName('GCR-booking', 'X', '2026-10-19T17:02:31Z')).not.toBe(versionedPdfName('GCR-booking', 'X', '2026-10-19T17:09:00Z'))
  })
  it('falls back to the plain name', () => {
    expect(versionedPdfName('GCR-quote', 'Q1', null)).toBe('GCR-quote-Q1.pdf')
  })
})
