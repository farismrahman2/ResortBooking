/** "Chrome on Windows", "Safari on iPhone" — from a browser's user-agent string. */
export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return 'Unknown device'
  const os =
    /iPhone/i.test(ua) ? 'iPhone'
    : /iPad/i.test(ua) ? 'iPad'
    : /Android/i.test(ua) ? 'Android'
    : /Windows/i.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua) ? 'Mac'
    : /CrOS/i.test(ua) ? 'Chromebook'
    : /Linux/i.test(ua) ? 'Linux'
    : null
  const browser =
    /Edg\//i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
    : /SamsungBrowser/i.test(ua) ? 'Samsung Internet'
    : /CriOS|Chrome\//i.test(ua) ? 'Chrome'
    : /FxiOS|Firefox\//i.test(ua) ? 'Firefox'
    : /Safari\//i.test(ua) ? 'Safari'
    : null
  if (browser && os) return `${browser} on ${os}`
  return browser ?? os ?? 'Unknown device'
}
