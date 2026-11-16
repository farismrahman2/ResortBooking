const STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  submitted: 'bg-sky-50 text-sky-800 border-sky-200',
  checked: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  unpaid: 'bg-red-50 text-red-700 border-red-200',
  part_paid: 'bg-amber-50 text-amber-800 border-amber-200',
  paid: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  quoted: 'bg-sky-50 text-sky-800 border-sky-200',
  on_hold: 'bg-amber-50 text-amber-800 border-amber-200',
  completed: 'bg-gray-100 text-gray-700 border-gray-200',
}
const LABELS: Record<string, string> = {
  submitted: 'Waiting check', checked: 'Waiting approval', rejected: 'Sent back', part_paid: 'Part paid', on_hold: 'On hold',
}
export function LsStatus({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STYLES[status] ?? STYLES.draft}`}>
      {LABELS[status] ?? status.replace(/_/g, ' ')}
    </span>
  )
}
