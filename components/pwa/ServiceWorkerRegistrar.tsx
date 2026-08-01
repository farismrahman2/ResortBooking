'use client'

import { useEffect } from 'react'

/**
 * Registers the field-visit service worker.
 *
 * Only registered in production — in dev the SW would serve stale bundles and
 * make hot reload behave bizarrely, which costs more than it's worth.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[sw] registration failed:', err)
      })
    }
    // Wait for load so the SW install never competes with first paint.
    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register, { once: true })
  }, [])
  return null
}
