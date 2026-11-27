import { LsHeader } from './LsShell'

/** Which section a page belongs to (kept for the pages; the shell highlights by address). */
export type LsTab = 'overview' | 'requisitions' | 'bills' | 'payments' | 'cash' | 'projects' | 'suppliers' | 'reports' | 'team'

/**
 * Page frame for every landscaping screen: a compact header (title, context,
 * actions, optional back link) and the page body at a readable width.
 */
export function LsPage({ title, subtitle, actions, back, children, narrow }: {
  tab?: LsTab
  title: React.ReactNode
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  back?: string
  /** Forms read better in a narrower column. */
  narrow?: boolean
  children: React.ReactNode
}) {
  return (
    <>
      <LsHeader title={title} subtitle={subtitle} actions={actions} back={back} />
      <div className={`mx-auto space-y-4 px-4 py-4 sm:px-6 sm:py-5 ${narrow ? 'max-w-3xl' : 'max-w-6xl'}`}>{children}</div>
    </>
  )
}
