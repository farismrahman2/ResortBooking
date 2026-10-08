import type { Metadata } from 'next'
import { Inter, Noto_Sans_Bengali } from 'next/font/google'
import './globals.css'
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// Loaded as a fallback so glyphs missing from Inter — notably the BDT taka
// sign (৳ U+09F3) — render with correct metrics instead of crashing into
// adjacent digits via whatever system Bangla font the OS happens to have.
const notoSansBengali = Noto_Sans_Bengali({
  subsets: ['bengali'],
  variable: '--font-bn',
  weight:   ['400', '500', '600', '700'],
  display:  'swap',
  // Not preloaded: 107 KB that every page fetched up front. The font's
  // unicode-range means the browser fetches it only once a page actually
  // shows a Bengali glyph (৳ or a Bangla report), then keeps it cached.
  preload:  false,
})

export const metadata: Metadata = {
  manifest: '/manifest.json',
  title: {
    template: '%s | Garden Centre Resort',
    default: 'Garden Centre Resort — Agent',
  },
  description: 'Internal quotation and booking management system',
  robots: 'noindex, nofollow',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${notoSansBengali.variable}`}>
      <body className="min-h-screen bg-gray-50">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
