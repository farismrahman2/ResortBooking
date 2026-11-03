import { describe, expect, it } from 'vitest'
import { describeUserAgent } from './user-agent'

describe('describeUserAgent', () => {
  it('names common devices', () => {
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe('Chrome on Windows')
    expect(describeUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone')
    expect(describeUserAgent('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0 Mobile Safari/537.36')).toBe('Samsung Internet on Android')
    expect(describeUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge on Windows')
  })
  it('falls back gracefully', () => {
    expect(describeUserAgent(null)).toBe('Unknown device')
    expect(describeUserAgent('curl/8.0')).toBe('Unknown device')
  })
})
