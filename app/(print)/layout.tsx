import type { ReactNode } from 'react'
import { Noto_Sans_Bengali } from 'next/font/google'

// Bangla glyphs need a proper Bengali font; Noto Sans Bengali covers the
// full Bangla unicode range. Subset via next/font so we don't pay for it
// on the rest of the app.
const bn = Noto_Sans_Bengali({
  subsets: ['bengali', 'latin'],
  variable: '--font-bn',
  weight:   ['400', '500', '600', '700'],
  display:  'swap',
})

export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${bn.variable} font-sans`} style={{ fontFamily: 'var(--font-bn), system-ui, sans-serif' }}>
      {children}
    </div>
  )
}
