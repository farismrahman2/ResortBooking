'use client'

/**
 * Link to a generated PDF that always fetches the current version.
 *
 * The PDF routes render fresh every time, but phones (Android Chrome saving
 * "GCR-booking-1304.pdf" to Downloads) and some browsers reopened the copy
 * they already had for the same address — so after a booking was edited
 * the "new" PDF showed the old booking. Each tap now gets its own address.
 */
export function PdfLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={(e) => {
        const url = new URL(href, window.location.origin)
        url.searchParams.set('t', String(Date.now()))
        e.currentTarget.href = url.pathname + url.search
      }}
    >
      {children}
    </a>
  )
}
