import { cn } from '@/lib/utils'

/** One badge for every landscaping status. Unpaid is amber (money due), not red like "sent back". */
const STYLES: Record<string, string> = {
  draft: 'bg-gray-50 text-gray-600 border-gray-300 border-dashed',
  submitted: 'bg-sky-50 text-sky-800 border-sky-200',
  checked: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200 line-through',
  unpaid: 'bg-amber-50 text-amber-800 border-amber-300',
  part_paid: 'bg-yellow-50 text-yellow-800 border-yellow-200',
  paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  active: 'bg-forest-50 text-forest-800 border-forest-200',
  quoted: 'bg-sky-50 text-sky-800 border-sky-200',
  on_hold: 'bg-amber-50 text-amber-800 border-amber-200',
  completed: 'bg-slate-100 text-slate-700 border-slate-300',
}
const LABELS: Record<string, string> = {
  draft: 'Draft', submitted: 'Waiting check', checked: 'Waiting approval', approved: 'Approved', rejected: 'Sent back',
  cancelled: 'Cancelled', unpaid: 'Unpaid', part_paid: 'Part paid', paid: 'Paid', active: 'Active', quoted: 'Quoted',
  on_hold: 'On hold', completed: 'Completed',
}
export function LsStatus({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn('inline-flex flex-shrink-0 items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium', STYLES[status] ?? STYLES.draft, className)}>
      {LABELS[status] ?? status.replace(/_/g, ' ')}
    </span>
  )
}

/** Small grey tag, e.g. "Paper". */
export function LsTag({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex flex-shrink-0 items-center rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600">{children}</span>
}
